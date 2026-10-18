import { useLocation, useNavigate } from 'react-router-dom';
import { PIPELINE_KINDS } from '../../../features/pipelines/pipelineKinds';
import { parsePipelineParams, withKind } from '../../../features/pipelines/pipelineParams';
import type { PipelineKindKey } from '../../../features/pipelines/pipelineTypes';
import { SegmentedControl } from '../../ui';

const OPTIONS = (['opportunities', 'risks'] as const).map((key) => ({ value: key, label: PIPELINE_KINDS[key].title }));

/** Opportunities | Risks (spec 2026-09-30 §1), leading the toolbar at every
 *  width (UI foundations spec §5.3: a kind switch leads the Toolbar). A
 *  choice keeps the view and the shared filters (`withKind`). */
export function PipelineKindSwitch() {
  const location = useLocation();
  const navigate = useNavigate();
  const search = new URLSearchParams(location.search);
  const current = parsePipelineParams(search).kind;
  return (
    <SegmentedControl<PipelineKindKey>
      label="Opportunities or risks"
      value={current}
      options={OPTIONS}
      onChange={(key) => {
        if (key === current) return;
        const next = withKind(search, key).toString();
        navigate({ pathname: location.pathname, search: next ? `?${next}` : '' });
      }}
    />
  );
}
