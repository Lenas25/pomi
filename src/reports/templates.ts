import {
  AVAILABLE_SECTIONS,
  type ReportSectionId,
  type ReportSelection,
  type ReportTemplateId,
} from './types';

/** Sections each template starts with (PLAN §14). Photos are never part of a template. */
export const TEMPLATE_SECTIONS: Record<ReportTemplateId, readonly ReportSectionId[]> = {
  // Consistency, sets per exercise and progression (gym) plus the measurements.
  trainer: ['gym', 'measures'],
  // Weight and measurements, water and food notes (habits).
  nutritionist: ['measures', 'habits'],
  // Everything chosen goes, plus the instruction line.
  ai: ['gym', 'habits', 'sleep', 'measures'],
  custom: ['gym', 'habits', 'sleep', 'measures'],
};

/** Food notes start on only for the nutritionist. */
const TEMPLATE_FOOD_NOTES: Record<ReportTemplateId, boolean> = {
  trainer: false,
  nutritionist: true,
  ai: false,
  custom: false,
};

export function defaultSelection(template: ReportTemplateId = 'custom'): ReportSelection {
  return applyTemplate(
    { template, sections: [], period: '30d', note: '', foodNotes: false },
    template,
  );
}

/** Switches to `template`: its sections and food-notes default replace the current ones. */
export function applyTemplate(
  selection: ReportSelection,
  template: ReportTemplateId,
): ReportSelection {
  return {
    ...selection,
    template,
    sections: TEMPLATE_SECTIONS[template].filter((id) => AVAILABLE_SECTIONS.includes(id)),
    foodNotes: TEMPLATE_FOOD_NOTES[template],
  };
}

/** Toggles one section. The template stays (it also carries the AI instruction). */
export function toggleSection(selection: ReportSelection, id: ReportSectionId): ReportSelection {
  const has = selection.sections.includes(id);
  return {
    ...selection,
    sections: has
      ? selection.sections.filter((section) => section !== id)
      : [...selection.sections, id],
  };
}
