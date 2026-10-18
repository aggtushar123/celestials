import { RECEIVE_OPTIONS, SET, SOURCE_SPECS } from '../../features/work/workSettings';
import type { WorkSettings } from '../../features/work/workTypes';
import { MetaParts, NUM, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../ui';

/** The recommender's settings for a member (Decision 10): the values as
 *  text in the same sections, never disabled controls, and who may change
 *  them. */
export function WorkSettingsSummary({ settings }: { settings: WorkSettings }) {
  const receives = RECEIVE_OPTIONS.find((option) => option.value === settings.recommend_to)?.label ?? settings.recommend_to;
  return (
    <div className="flex flex-col gap-6">
      <SettingsNote icon="lock">{SET.READ_ONLY}</SettingsNote>
      {/* The heading names it; the row says only who. */}
      <SettingsSection title={SET.RECEIVES}>
        <div className="px-4 py-3">
          <p className={TYPE.body}>{receives}</p>
        </div>
      </SettingsSection>
      <SettingsSection title={SET.SIGNALS} list={SET.SIGNALS}>
        {SOURCE_SPECS.map((spec) => {
          const saved = settings.sources[spec.kind];
          return (
            <li key={spec.kind} data-source={spec.kind} className="flex flex-col gap-1 px-4 py-3">
              <p className={TYPE.body}>
                <span className="font-semibold">{spec.label}:</span>{' '}
                <MetaParts
                  parts={[
                    saved?.enabled ? SET.ON : SET.OFF,
                    ...spec.fields.map((field) => (
                      <>
                        {field.label} <span className={NUM}>{saved?.[field.field] ?? ''}</span>
                      </>
                    )),
                  ]}
                />
              </p>
              <p className={TYPE.meta}>{spec.detail}</p>
            </li>
          );
        })}
      </SettingsSection>
      <SettingsSection title={SET.DISMISSALS}>
        <SettingsRow label={SET.COOLDOWN}>
          <p className={`${TYPE.body} ${NUM}`}>{settings.dismiss_cooldown_days}</p>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
