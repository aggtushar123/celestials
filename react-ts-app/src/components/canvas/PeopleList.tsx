import { Link } from 'react-router-dom';
import { nodeKind } from '../../features/canvas/canvasBoard';
import { SAY } from '../../features/canvas/canvasOptions';
import { relationshipText } from '../../features/canvas/canvasText';
import { Card, CardSection, FOCUS, INLINE_TARGET, TYPE } from '../ui';
import { PersonFactsList } from './facts';
import type { MapApi } from './useMap';

/** The phone view (spec §2.2): people with their facts, then relationships
 *  as "A reports to B". Hidden people stay nameless. */
export function PeopleList({ map }: { map: MapApi }) {
  return (
    <Card pad="none" role="region" aria-label="People">
      <ul className="flex flex-col divide-y divide-line-subtle">
        {map.nodes.map((node) => {
          const kind = nodeKind(node, map.hidden, map.people);
          const person = map.people[String(node.data.contact_id)];
          return (
            <li key={node.id} className="flex flex-col gap-1 px-4 py-3">
              {kind === 'person' && person ? (
                <>
                  <span className={`${TYPE.body} font-semibold`}>{person.name}</span>
                  <span className={TYPE.meta}>{person.role_display}</span>
                  <PersonFactsList person={person} />
                  <Link to={`/contacts/${node.data.contact_id}`} className={`${INLINE_TARGET} self-start ${TYPE.body} underline ${FOCUS}`}>
                    Open contact
                  </Link>
                </>
              ) : (
                <span className={TYPE.bodyMuted}>{kind === 'hidden' ? SAY.HIDDEN : SAY.REMOVED}</span>
              )}
            </li>
          );
        })}
      </ul>
      <CardSection>
        <h2 className={TYPE.label}>Relationships</h2>
        {map.edges.length === 0 ? (
          <p className={`mt-1 ${TYPE.bodyMuted}`}>No relationships yet.</p>
        ) : (
          <ul aria-label="Relationships" className={`mt-1 flex flex-col gap-1 ${TYPE.body}`}>
            {map.edges.map((line) => (
              <li key={line.id}>{relationshipText(map.nameOf(line.source), line.data?.label ?? '', map.nameOf(line.target))}</li>
            ))}
          </ul>
        )}
      </CardSection>
    </Card>
  );
}
