"""The map's rules (spec §1.1, §1.4): what a save may hold, how a stored map
reads back, and how a map built from people is laid out."""

from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from services.customers.canvas import (
    BAD_EDGE,
    BAD_LABEL,
    BAD_NODE,
    CONTACT_TWICE,
    EDGE_ENDS,
    EDGE_ID_TWICE,
    EDGE_TWICE,
    NAME_NEEDED,
    NAME_TOO_LONG,
    NODE_ID_TWICE,
    NOT_ON_RECORD,
    TOO_MANY_LINES,
    TOO_MANY_PEOPLE,
    clean_edges,
    clean_name,
    clean_nodes,
    layout,
    people_nodes,
    stored_edges,
    stored_nodes,
)
from services.customers.models import Customer
from services.customers.tests.canvas_fixtures import CanvasFixture

NODES = [
    {"id": key, "position": {"x": 0, "y": 0}, "data": {"contact_id": pk}}
    for key, pk in (("a", 1), ("b", 2), ("c", 3))
]


def edge(id, source, target, label="Reports to"):
    return {"id": id, "source": source, "target": target, "label": label}


class StoredShapeTests(SimpleTestCase):
    def test_react_flow_keys_are_left_out_and_a_missing_label_reads_as_none(self):
        nodes = stored_nodes(
            [
                {
                    "id": "n1",
                    "type": "contact",
                    "width": 200,
                    "selected": True,
                    "position": {"x": 1, "y": 2.5},
                    "data": {"contact_id": 5, "name": "Ann"},
                },
                {
                    "id": "n2",
                    "type": "contact",
                    "position": {"x": 0, "y": 0},
                    "data": {"contact_id": 6},
                },
                {"id": "junk", "position": {"x": 0, "y": 0}, "data": {}},
            ]
        )
        self.assertEqual(
            nodes,
            [
                {"id": "n1", "position": {"x": 1, "y": 2.5}, "data": {"contact_id": 5}},
                {"id": "n2", "position": {"x": 0, "y": 0}, "data": {"contact_id": 6}},
            ],
        )
        edges = stored_edges(
            [
                {
                    "id": "e1",
                    "source": "n1",
                    "target": "n2",
                    "type": "relationship",
                    "sourceHandle": None,
                },
                {"id": "e2", "source": "n1", "target": "junk", "label": "Blocks"},
                {"id": "e3", "source": "n2", "target": "n1", "label": "Old label"},
            ],
            nodes,
        )
        self.assertEqual(
            edges,
            [
                {"id": "e1", "source": "n1", "target": "n2", "label": ""},
                {"id": "e3", "source": "n2", "target": "n1", "label": ""},
            ],
        )

    def test_anything_but_a_list_reads_as_empty(self):
        self.assertEqual(stored_nodes({"a": 1}), [])
        self.assertEqual(stored_edges(None, []), [])

    def test_duplicates_in_a_legacy_map_dedupe_first_wins(self):
        """A map saved before duplicates were refused can hold a repeated
        node id, a repeated contact, a repeated edge id or a repeated
        (source, target, label) — each reads back with the first occurrence
        only, and an edge to a node that got dropped is dropped too, so the
        result is a shape `clean_nodes`/`clean_edges` would accept as-is."""
        nodes = stored_nodes(
            [
                {"id": "a", "position": {"x": 0, "y": 0}, "data": {"contact_id": 1}},
                {"id": "a", "position": {"x": 1, "y": 1}, "data": {"contact_id": 2}},
                {"id": "b", "position": {"x": 2, "y": 2}, "data": {"contact_id": 1}},
                {"id": "c", "position": {"x": 3, "y": 3}, "data": {"contact_id": 3}},
            ]
        )
        self.assertEqual(
            nodes,
            [
                {"id": "a", "position": {"x": 0, "y": 0}, "data": {"contact_id": 1}},
                {"id": "c", "position": {"x": 3, "y": 3}, "data": {"contact_id": 3}},
            ],
        )
        edges = stored_edges(
            [
                {"id": "e1", "source": "a", "target": "c", "label": "Blocks"},
                {"id": "e1", "source": "a", "target": "c", "label": "Influences"},
                {"id": "e2", "source": "a", "target": "c", "label": "Blocks"},
                {"id": "e3", "source": "a", "target": "z", "label": ""},
            ],
            nodes,
        )
        self.assertEqual(edges, [{"id": "e1", "source": "a", "target": "c", "label": "Blocks"}])


class NameTests(SimpleTestCase):
    def test_trimmed_required_and_at_most_120(self):
        self.assertEqual(clean_name("  Renewal map "), "Renewal map")
        self.assertEqual(clean_name("x" * 120), "x" * 120)
        for bad, message in (
            ("", NAME_NEEDED),
            ("   ", NAME_NEEDED),
            (None, NAME_NEEDED),
            (7, NAME_NEEDED),
            ("x" * 121, NAME_TOO_LONG),
        ):
            with self.subTest(bad=bad), self.assertRaises(ValidationError) as caught:
                clean_name(bad)
            self.assertEqual(caught.exception.detail, {"name": [message]})


class EdgeRuleTests(SimpleTestCase):
    def refused(self, edges, message):
        with self.assertRaises(ValidationError) as caught:
            clean_edges(edges, NODES)
        self.assertEqual(caught.exception.detail, {"edges": [message]})

    def test_the_four_labels_and_none_and_extra_keys_dropped(self):
        edges = clean_edges(
            [
                {**edge("e1", "a", "b"), "type": "relationship", "animated": True},
                edge("e2", "b", "c", ""),
                edge("e3", "a", "c", "Influences"),
                {"id": "e4", "source": "c", "target": "a"},
            ],
            NODES,
        )
        self.assertEqual(
            edges,
            [
                edge("e1", "a", "b"),
                edge("e2", "b", "c", ""),
                edge("e3", "a", "c", "Influences"),
                edge("e4", "c", "a", ""),
            ],
        )

    def test_the_same_pair_may_carry_different_labels_and_both_directions(self):
        edges = [edge("e1", "a", "b"), edge("e2", "a", "b", "Blocks"), edge("e3", "b", "a")]
        self.assertEqual(len(clean_edges(edges, NODES)), 3)

    def test_refusals(self):
        cases = [
            ("not a list", "x", BAD_EDGE),
            ("no target", [{"id": "e1", "source": "a", "label": ""}], BAD_EDGE),
            ("a number as a label", [edge("e1", "a", "b", 3)], BAD_EDGE),
            ("unknown label", [edge("e1", "a", "b", "Likes")], BAD_LABEL),
            ("to nobody", [edge("e1", "a", "z")], EDGE_ENDS),
            ("to itself", [edge("e1", "a", "a")], EDGE_ENDS),
            ("same id", [edge("e1", "a", "b"), edge("e1", "b", "c")], EDGE_ID_TWICE),
            ("same link", [edge("e1", "a", "b"), edge("e2", "a", "b")], EDGE_TWICE),
        ]
        for label, edges, message in cases:
            with self.subTest(label):
                self.refused(edges, message)

    def test_at_most_150(self):
        with patch("services.customers.canvas.MAX_EDGES", 1):
            self.refused([edge("e1", "a", "b"), edge("e2", "b", "c")], TOO_MANY_LINES)


class LayoutTests(SimpleTestCase):
    def test_each_rank_starts_a_row_and_a_row_holds_six(self):
        people = [(100, 0), *[(pk, 1) for pk in range(1, 9)], (20, 3)]
        spots = [
            (n["data"]["contact_id"], n["position"]["x"], n["position"]["y"])
            for n in layout(people)
        ]
        self.assertEqual(spots[0], (100, 0, 0))
        self.assertEqual(spots[1:7], [(pk, 240 * (pk - 1), 160) for pk in range(1, 7)])
        self.assertEqual(spots[7:9], [(7, 0, 320), (8, 240, 320)])
        self.assertEqual(spots[9], (20, 0, 480))
        self.assertEqual(layout([(100, 0)])[0]["id"], "c100")

    def test_nobody_is_no_nodes(self):
        self.assertEqual(layout([]), [])


class NodeRuleTests(CanvasFixture):
    def clean(self, nodes, *, record=None, kept=(), viewer=None):
        record = record or self.pizza
        on = (
            {"customer_id": record.pk}
            if isinstance(record, Customer)
            else {"account_id": record.pk}
        )
        return clean_nodes(nodes, viewer=viewer or self.csm, kept_contact_ids=set(kept), **on)

    def refused(self, nodes, message, **kwargs):
        with self.assertRaises(ValidationError) as caught:
            self.clean(nodes, **kwargs)
        self.assertEqual(caught.exception.detail, {"nodes": [message]})

    def test_an_organisation_map_takes_its_own_and_its_accounts_people(self):
        sent = [
            self.node(self.ann),
            {**self.node(self.ben, 240), "type": "contact", "dragging": True},
        ]
        self.assertEqual(self.clean(sent), [self.node(self.ann), self.node(self.ben, 240)])

    def test_an_account_map_takes_only_its_own_people(self):
        self.assertEqual(len(self.clean([self.node(self.ben)], record=self.emea)), 1)
        self.refused([self.node(self.ann)], NOT_ON_RECORD, record=self.emea)

    def test_people_from_elsewhere_or_hidden_from_the_saver_are_refused(self):
        for person in (self.tia, self.dot):
            with self.subTest(person=person.name):
                self.refused([self.node(person)], NOT_ON_RECORD)
        self.refused([self.node(self.tom)], NOT_ON_RECORD, record=self.taco)
        self.assertEqual(
            len(self.clean([self.node(self.tom)], record=self.taco, viewer=self.other)), 1
        )

    def test_people_already_on_the_map_stay_though_hidden_or_deleted(self):
        gone = {"id": "gone", "position": {"x": 0, "y": 0}, "data": {"contact_id": 999_999}}
        nodes = self.clean(
            [self.node(self.tom), gone], record=self.taco, kept={self.tom.pk, 999_999}
        )
        self.assertEqual(len(nodes), 2)

    def test_shape_and_duplicates(self):
        ann = self.node(self.ann)
        cases = [
            ("not a list", {"a": 1}, BAD_NODE),
            ("no position", [{"id": "n1", "data": {"contact_id": self.ann.pk}}], BAD_NODE),
            ("text coordinate", [{**ann, "position": {"x": "1", "y": 0}}], BAD_NODE),
            ("far away", [{**ann, "position": {"x": 2_000_000, "y": 0}}], BAD_NODE),
            ("long id", [{**ann, "id": "x" * 65}], BAD_NODE),
            ("no contact", [{**ann, "data": {}}], BAD_NODE),
            ("true as a contact", [{**ann, "data": {"contact_id": True}}], BAD_NODE),
            ("same id", [ann, {**self.node(self.cal), "id": ann["id"]}], NODE_ID_TWICE),
            ("same person", [ann, {**ann, "id": "other"}], CONTACT_TWICE),
        ]
        for label, nodes, message in cases:
            with self.subTest(label):
                self.refused(nodes, message)

    def test_at_most_60(self):
        with patch("services.customers.canvas.MAX_NODES", 1):
            self.refused([self.node(self.ann), self.node(self.cal)], TOO_MANY_PEOPLE)


class PeopleNodesTests(CanvasFixture):
    def ids(self, nodes):
        return [node["data"]["contact_id"] for node in nodes]

    def test_the_records_people_in_rows_by_role_then_name(self):
        nodes = people_nodes(self.csm, customer_id=self.pizza.pk)
        self.assertEqual(
            nodes,
            [self.node(self.ben, 0, 0), self.node(self.cal, 240, 0), self.node(self.ann, 0, 160)],
        )

    def test_only_people_the_creator_may_open(self):
        self.assertEqual(
            self.ids(people_nodes(self.csm, customer_id=self.taco.pk)), [self.tia.pk, self.eve.pk]
        )
        self.assertEqual(
            self.ids(people_nodes(self.other, customer_id=self.taco.pk)),
            [self.tia.pk, self.tom.pk, self.eve.pk],
        )

    def test_an_account_holds_its_own_people(self):
        self.assertEqual(self.ids(people_nodes(self.csm, account_id=self.emea.pk)), [self.ben.pk])

    def test_at_most_60(self):
        with patch("services.customers.canvas.MAX_NODES", 2):
            self.assertEqual(
                self.ids(people_nodes(self.csm, customer_id=self.pizza.pk)),
                [self.ben.pk, self.cal.pk],
            )
