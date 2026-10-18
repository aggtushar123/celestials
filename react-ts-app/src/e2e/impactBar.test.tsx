import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, within } from '@testing-library/react';
import { resetViewport } from '../test/viewport';
import { RENEWAL_RISK, stubSegments } from '../features/segments/testSegments';
import { Q3_NPS, stubSurveys } from '../features/surveys/testSurveys';
import { RENEWAL_WATCH, stubRules } from '../features/rules/testRules';
import { GLOBEX_ONBOARDING, stubPlans } from '../features/plans/testPlans';
import { stubCampaigns } from '../features/campaigns/testCampaigns';
import { WIN_BACK } from '../features/campaigns/testCampaignFixtures';
import { stubCanvases } from '../features/canvas/testCanvases';
import { EMEA_MAP } from '../features/canvas/testCanvasFixtures';
import { renderSegments } from '../pages/segments/testPages';
import { renderSurveys } from '../pages/surveys/testPages';
import { renderRules } from '../pages/rules/testPages';
import { renderPlans } from '../pages/plans/testPages';
import { renderCampaigns } from '../pages/campaigns/testPages';
import { renderCanvas } from '../pages/canvas/testPages';

// Every Impact route draws its own title or Back link in the bar through
// PageHeader (UI foundations spec §6.1). A route missing from the Navbar's
// titledByPage would render no PageHeader at all: this walks each area
// through its real pages and the real Navbar.
const bar = () => within(document.querySelector('header')!);

async function expectTitle(name: string) {
  expect(await bar().findByRole('heading', { level: 1, name })).toBeInTheDocument();
}

async function expectBack(name: string, href: string) {
  expect(await bar().findByRole('link', { name })).toHaveAttribute('href', href);
}

describe('Impact routes title themselves in the bar', () => {
  afterEach(() => {
    cleanup();
    resetViewport();
    vi.unstubAllGlobals();
  });

  it('Segments: the list, a segment, and a segment that is not there', async () => {
    stubSegments();
    renderSegments('/segments', { nav: true });
    await expectTitle('Segments');
    cleanup();
    stubSegments();
    renderSegments(`/segments/${RENEWAL_RISK.id}`, { nav: true });
    await expectBack('Segments', '/segments');
    cleanup();
    stubSegments();
    renderSegments('/segments/abc', { nav: true });
    await expectBack('Segments', '/segments');
  });

  it('Surveys: the tabs page and a send', async () => {
    stubSurveys();
    renderSurveys('/surveys', { nav: true });
    await expectTitle('Surveys');
    cleanup();
    stubSurveys();
    renderSurveys(`/surveys/${Q3_NPS.id}`, { nav: true });
    await expectBack('Surveys', '/surveys');
  });

  it('Scenarios: the tabs page and a rule', async () => {
    stubRules();
    renderRules('/scenarios', { nav: true });
    await expectTitle('Scenarios');
    cleanup();
    stubRules();
    renderRules(`/scenarios/rules/${RENEWAL_WATCH.id}`, { nav: true });
    await expectBack('Scenarios', '/scenarios');
  });

  it('Project Management: the list, a plan and the templates', async () => {
    stubPlans();
    renderPlans('/projects', { nav: true });
    await expectTitle('Project Management');
    cleanup();
    stubPlans();
    renderPlans(`/projects/${GLOBEX_ONBOARDING.id}`, { nav: true });
    await expectBack('Project Management', '/projects');
    cleanup();
    stubPlans();
    renderPlans('/projects/templates', { nav: true });
    await expectBack('Project Management', '/projects');
  });

  it('Campaigns: the list and a campaign', async () => {
    stubCampaigns();
    renderCampaigns('/campaigns', { nav: true });
    await expectTitle('Campaigns');
    cleanup();
    stubCampaigns();
    renderCampaigns(`/campaigns/${WIN_BACK.id}`, { nav: true });
    await expectBack('Campaigns', '/campaigns');
  });

  it('Canvas: the gallery and a map', async () => {
    stubCanvases();
    renderCanvas('/canvas', { nav: true });
    await expectTitle('Canvas');
    cleanup();
    stubCanvases();
    renderCanvas(`/canvas/${EMEA_MAP.id}`, { nav: true });
    await expectBack('Canvas', '/canvas');
  });
});
