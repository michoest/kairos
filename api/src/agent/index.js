import { buildToolRegistry } from './tools/index.js';
import { buildAgentContext } from './context-builder.js';
import { emit } from '../events.js';

const BASE_PROMPT = `Du bist Kairos, ein KI-Assistent in einem persönlichen Aufgabenmanager.

Du erhältst „Trigger": Nutzereingaben (Kontextbeobachtungen oder direkte Anweisungen), Nutzeraktionen (Aufgabe erstellt/aktualisiert/abgeschlossen, Inbox-Eintrag hinzugefügt) und zeitgesteuerte Ereignisse (Deadline nähert sich/überfällig, Nachhaken-Erinnerungen). Bei jedem Trigger entscheidest du, ob und wie du hilfst.

Du verfügst über Werkzeuge zur Verwaltung von Aufgaben, Abhängigkeiten, Kategorien, Spaces, der Inbox sowie zur Anzeige von Nachrichten oder Aktionsvorschlägen an den Nutzer. Der aktuelle Zustand (Aufgaben, Inbox, zuletzt erfasster Kontext) ist in jeder Anfrage enthalten.

Das Datenmodell:
- Aufgaben: status ∈ {open, in_progress, waiting, done, cancelled}. „waiting" = wartet auf eine andere Person (Feld „responsible"). Eine Aufgabe hat außerdem is_active (inaktiv = pausiert, Scheduler ignoriert sie). Wiederkehrende Aufgaben haben eine Wiederholungsregel; beim Abschließen wird die Deadline vorgerückt statt die Aufgabe geschlossen.
- Abhängigkeiten sind m:n; is_blocked wird abgeleitet.
- Inbox: unstrukturierte Textschnipsel, die noch zu Aufgaben werden sollen.

Allgemeine Regeln:
- Erstelle niemals ein Duplikat einer vorhandenen offenen Aufgabe — prüfe die Liste zuerst.
- Wenn du eine Aufgabe erstellen möchtest, aber nicht sicher bist, in welche Kategorie sie passt, verwende stattdessen add_to_inbox.
- Beim Erstellen einer Aufgabe aus Freitext nützliche Daten in den Metadata-JSON-Blob einbetten (URLs als 'url', Telefonnummern als 'tel:+49…', E-Mails als einfachen String, Notizen als 'note').
- Wenn eine Eingabe einen Blocker impliziert („vor X muss Y erledigt sein"), erstelle die Voraussetzungs-Aufgabe und füge add_dependency hinzu.
- Bei BULK-Operationen oder Änderungen, die der Nutzer bestätigen sollte (viele Aufgaben deaktivieren, Abhängigkeiten umstrukturieren), verwende propose_actions. Einzelne, eindeutig korrekte Aktionen führe direkt aus.
- Rufe notify_user HÖCHSTENS EINMAL pro Run auf; fasse alles in einer prägnanten Nachricht zusammen. Gleiches gilt für propose_actions. Mische propose_actions und direkte zustandsändernde Aufrufe NICHT im selben Run.
- Beende immer mit direkten Tool-Aufrufen, notify_user, propose_actions oder no_action — niemals mit reinem Fließtext.`;

const MODE_PROMPTS = {
  context_event: `Dieser Trigger ist eine KONTEXT-BEOBACHTUNG — der Nutzer hat dir mitgeteilt, was passiert ist oder was der Fall ist, nicht was du tun sollst. Sei zurückhaltend: Wenn nichts im Kontext eine Änderung rechtfertigt, rufe no_action mit einer kurzen Begründung auf. Bevorzuge notify_user gegenüber spekulativen Bearbeitungen.`,

  instruction: `Dieser Trigger ist eine DIREKTE ANWEISUNG — der Nutzer sagt dir, was du tun sollst. Führe es aus. Verwende no_action nicht, außer die Anweisung ist eindeutig unmöglich oder fehlerhaft (teile das über notify_user mit). Wenn die Anweisung mehrdeutig ist (unklares Ziel, fehlende Kategorie, mehrere Treffer), stelle eine konkrete Rückfrage über notify_user. Wenn sie viele Änderungen nach sich ziehen würde, nutze propose_actions zur Bestätigung durch den Nutzer.`,

  auto: `Dieser Trigger stammt von einer externen Quelle (z. B. Siri), die die Absicht nicht klassifiziert hat. Deine erste Aufgabe ist die Klassifikation: Handelt es sich um eine direkte Anweisung („bitte tu X") oder eine Kontextbeobachtung („X ist passiert / das ist so")? Dann folge den Regeln für den jeweiligen Modus:
- Klingt es wie eine Anweisung: direkt ausführen (oder propose_actions für Bulk-Änderungen / notify_user zur Klärung).
- Klingt es wie Kontext: zurückhaltend vorgehen, no_action ist in Ordnung, wenn nichts folgt.`,

  user_action: `Dieser Trigger ist eine Nutzeraktion, die der Nutzer gerade an einer Aufgabe durchgeführt hat. Reagiere nur, wenn du eine Inkonsistenz siehst, die es wert ist anzusprechen (nutzlose Abhängigkeit, überfällige Deadline, offensichtliches Duplikat). Stille (no_action) ist der erwartete Standardfall.`,

  deadline: `Dieser Trigger ist ein geplantes Deadline-Ereignis (nähert sich oder überfällig). Überlege, ob notify_user sinnvoll ist — typischerweise ja bei überfälligen Aufgaben, sparsam bei bevorstehenden.`,

  follow_up: `Dieser Trigger wird ausgelöst, weil der follow_up_at-Zeitpunkt einer wartenden Aufgabe erreicht wurde. Der Nutzer wollte daran erinnert werden, die verantwortliche Person zu kontaktieren. notify_user ist in der Regel angebracht.`,

  proposal: `Dieser Run führt einen akzeptierten Vorschlag aus. Führe einfach die Werkzeuge wie angegeben aus — kein notify_user oder propose_actions.`,
};

function systemPrompt(triggerType) {
  const mode = MODE_PROMPTS[triggerType] ?? '';
  return `${BASE_PROMPT}\n\n${mode}`.trim();
}

export function createAgent({ repo, openaiClient, model = 'gpt-4o', maxIterations = 5, logger = console }) {
  let activeTrigger = null;
  let activeRunState = null;
  const tools = buildToolRegistry({
    repo,
    currentTrigger: () => activeTrigger,
    currentRunState: () => activeRunState,
  });

  async function runAgent(trigger) {
    activeTrigger = normalizeTrigger(trigger);
    activeRunState = { notifyCount: 0 };
    const context = buildAgentContext({ repo });
    const triggerMessage = formatTrigger(activeTrigger);
    const userMessage = `TRIGGER:
${triggerMessage}

CURRENT STATE:
${JSON.stringify(context, null, 2)}`;

    const messages = [
      { role: 'system', content: systemPrompt(activeTrigger.type) },
      { role: 'user', content: userMessage },
    ];

    let iterations = 0;
    const toolCallLog = [];
    let finalMessage = null;
    let error = null;

    try {
      while (iterations < maxIterations) {
        iterations += 1;
        const response = await openaiClient.chat.completions.create({
          model,
          messages,
          tools: tools.openaiDefinitions(),
          tool_choice: 'auto',
        });

        const choice = response.choices[0];
        const msg = choice.message;
        messages.push(msg);

        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          finalMessage = msg.content ?? null;
          break;
        }

        let endedByNoAction = false;
        for (const call of msg.tool_calls) {
          const name = call.function?.name;
          let args;
          try { args = JSON.parse(call.function?.arguments || '{}'); }
          catch (e) { args = {}; }

          const tool = tools.get(name);
          let result;
          if (!tool) {
            result = { error: `unknown tool: ${name}` };
          } else {
            try { result = await tool.handler(args); }
            catch (e) { result = { error: e.message }; }
          }

          toolCallLog.push({ name, args, result });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });

          if (name === 'no_action') endedByNoAction = true;
        }

        if (endedByNoAction) break;
      }

      if (activeTrigger.type === 'context_event' && activeTrigger.payload?.event?.id) {
        repo.markContextEventProcessed(activeTrigger.payload.event.id);
      }
    } catch (e) {
      error = e.message;
      logger.error('Agent loop error:', e);
    }

    const runId = repo.createAgentRun({
      trigger_type: activeTrigger.type,
      trigger_payload: activeTrigger.payload ?? {},
      iterations,
      tool_calls: toolCallLog,
      final_message: finalMessage,
      error,
    });

    emit('agent.run', {
      id: runId,
      trigger_type: activeTrigger.type,
      iterations,
      tool_calls: toolCallLog,
      final_message: finalMessage,
      error,
      created_at: new Date().toISOString(),
    });

    activeTrigger = null;
    activeRunState = null;
    return { iterations, tool_calls: toolCallLog, final_message: finalMessage, error };
  }

  async function executeProposal(proposal) {
    // Execute a proposal's actions sequentially using the same tool registry.
    // Proposals run outside the normal agent loop — we use a synthetic trigger so tools
    // that care about the current run state still see sensible values.
    activeTrigger = normalizeTrigger({ type: 'proposal', payload: { proposal } });
    activeRunState = { notifyCount: 0, proposalCount: 1 };
    const results = [];
    try {
      for (const action of proposal.actions ?? []) {
        const rawName = action.tool ?? '';
        const name = rawName.replace(/^functions\./, '').replace(/^tool:/, '').trim();
        const tool = tools.get(name);
        if (!tool) {
          results.push({ tool: rawName, error: `unknown tool: ${rawName}` });
          continue;
        }
        try {
          const result = await tool.handler(action.args ?? {});
          results.push({ tool: name, result });
        } catch (e) {
          results.push({ tool: name, error: e.message });
        }
      }
    } finally {
      activeTrigger = null;
      activeRunState = null;
    }
    return results;
  }

  return { runAgent, executeProposal, tools };
}

function normalizeTrigger(trigger) {
  const payload = trigger.payload ?? {};
  let ref = null;
  if (trigger.type === 'context_event' || trigger.type === 'instruction' || trigger.type === 'auto') {
    ref = payload.event?.id ?? null;
  } else if (trigger.type === 'user_action') ref = payload.task?.id ?? null;
  else if (trigger.type === 'deadline' || trigger.type === 'follow_up') ref = payload.task?.id ?? null;
  else if (trigger.type === 'inbox_added') ref = payload.item?.id ?? null;
  return { ...trigger, payload, ref };
}

function formatTrigger(trigger) {
  switch (trigger.type) {
    case 'context_event':
    case 'instruction':
    case 'auto': {
      const e = trigger.payload.event;
      return `type: ${trigger.type}\nsource: ${e.source}\nmode: ${e.mode}\ncreated_at: ${e.created_at}\ncontent:\n${e.content}`;
    }
    case 'user_action': {
      const { action, task, previous } = trigger.payload;
      return `type: user_action\naction: ${action}\ntask: ${JSON.stringify(task)}${previous ? `\nprevious: ${JSON.stringify(previous)}` : ''}`;
    }
    case 'deadline': {
      const { task, kind } = trigger.payload;
      return `type: deadline\nkind: ${kind}\ntask: ${JSON.stringify(task)}`;
    }
    case 'follow_up': {
      return `type: follow_up\ntask: ${JSON.stringify(trigger.payload.task)}`;
    }
    case 'inbox_added': {
      return `type: inbox_added\nitem: ${JSON.stringify(trigger.payload.item)}`;
    }
    default:
      return `type: ${trigger.type}\npayload: ${JSON.stringify(trigger.payload)}`;
  }
}
