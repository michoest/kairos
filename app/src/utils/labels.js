export const SKIP_IN_ACTIONS = new Set(['notify_user', 'propose_actions', 'no_action']);

export const STATUS_LABELS = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  waiting: 'Wartet',
  done: 'Erledigt',
  cancelled: 'Verworfen',
};

export function statusLabel(s) {
  return STATUS_LABELS[s] ?? s;
}

export function actionLabel(a) {
  const args = a.args ?? {};
  switch (a.tool ?? a.name) {
    case 'update_task':   return `Aufgabe aktualisiert · ${updateSummary(args)}`;
    case 'create_task':   return `Aufgabe erstellt „${args.title ?? '?'}"`;
    case 'complete_task': return `Aufgabe abgeschlossen`;
    case 'cancel_task':   return `Aufgabe abgebrochen`;
    case 'add_dependency':    return `Abhängigkeit hinzugefügt`;
    case 'remove_dependency': return `Abhängigkeit entfernt`;
    case 'add_to_inbox':      return `Inbox: „${(args.content ?? '').slice(0, 40)}"`;
    case 'convert_inbox_item': return `Inbox-Item konvertiert`;
    case 'skip_recurrence':   return `Wiederholung übersprungen`;
    case 'create_space':    return `Space erstellt „${args.name}"`;
    case 'create_category': return `Kategorie erstellt „${args.name}"`;
    default: return a.tool ?? a.name ?? 'Aktion';
  }
}

function updateSummary(args) {
  const parts = [];
  if ('status' in args) parts.push(statusLabel(args.status));
  if ('is_active' in args) parts.push(args.is_active ? 'aktiviert' : 'deaktiviert');
  if ('deadline' in args) parts.push('Deadline');
  if ('follow_up_at' in args) parts.push('Nachhaken');
  if ('category_id' in args) parts.push('Kategorie');
  if ('responsible' in args) parts.push('Verantwortlich');
  if ('title' in args) parts.push('Titel');
  return parts.join(', ') || 'Update';
}
