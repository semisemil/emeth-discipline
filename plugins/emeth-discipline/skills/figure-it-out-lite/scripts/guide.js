'use strict';

const path = require('node:path');

const skills = path.resolve(__dirname, '../..').replaceAll('\\', '/');
const implementation = 'start-implementation/SKILL.md';
const blueprint = 'start-implementation/references/blueprint.md';
const ensemble = 'ensemble/SKILL.md';
const designForm = 'development-design/references/document-form.md';
const playbooks = 'start-implementation/references/playbooks';

const stages = new Map([
  ['route', [
    'Ground the outcome, affected behavior and constraints. Fill only evidence gaps that affect workflow selection or design. Decide whether current behavior or historical rationale needs investigation.',
    'Honor an explicitly selected workflow. Otherwise use Separate implementation and tests for changed interactions between stages or policies, state transitions or execution order, effects shared across calls or actors, or compatibility between coexisting representations or integrations. Use Combined implementation and tests when requirements and baseline establish what to deliver and preserve.',
    `Selection and grounding details: ${skills}/${implementation}#implementation-workflow and ${skills}/${blueprint}#phase-a-ground-the-problem`,
  ]],
  ['sketch', [
    'Reuse a valid selected design for the same work. For a new or changed internal design, dispatch two independent candidates from the same task and evidence before forming a preference. Give them the open design decisions and preserve supplied public contracts.',
    'Set comparison criteria before reading replies. Select and synthesize one design before dependent implementation. Record the decisions, tradeoffs and verification criteria in the Design.',
    `Candidate details: ${skills}/${blueprint}#phase-b-sketch and ${skills}/${ensemble}#phase-a-frame`,
  ]],
  ['design', [
    'Continue the named Design or one with the same goal after checking relevant paths or topics. Otherwise create one. Record the agreed outcome, scope, selected decisions, verification criteria and material open matters. Link source requirements and supporting detail where needed. Use document metadata for readiness.',
    `Document details: ${skills}/${designForm} and ${skills}/development-design/references/document-status.md`,
  ]],
  ['review', [
    'Review the selected Design before implementation. Use the independent judge for Separate implementation and tests and for design-only work. In Combined implementation and tests, the coordinator reviews the Design and the judge reviews the integrated result, subject to the contained-change exception.',
    'Give the judge the target, original requirements and relevant source evidence. Use tenet-me. Resolve material findings and review the affected revision. Honor a required user design checkpoint before implementation.',
    `Review details and exceptions: ${skills}/${ensemble}#independent-review and ${skills}/${implementation}#implementation-workflow`,
  ]],
  ['implement', [
    'Use the reviewed Design and retain the selected workflow’s verification ownership. Read the playbook for the work and reopen affected design decisions when evidence changes their contract or basis.',
    `Defect: ${skills}/${playbooks}/bug-fix.md`,
    `New or changed behavior: ${skills}/${playbooks}/feature.md`,
    `Behavior-preserving restructuring: ${skills}/${playbooks}/refactoring.md`,
    `Broad or unattended work, or no fitting playbook: ${skills}/start-implementation/references/large-change.md`,
  ]],
]);

const sections = stages.get(process.argv[2]);
if (!sections || process.argv.length !== 3) {
  process.stderr.write('Usage: node guide.js <route|sketch|design|review|implement>\n');
  process.exitCode = 1;
} else {
  process.stdout.write(sections.join('\n') + '\n');
}
