"""End-to-end tier: real server, real HTTP, real test DB.

Alice (admin) signs the workspace up and adds Carl and Dana. Dana owns Taco
Bell with Tia on it, and its account Taco West with Tom; Alice gives Carl the
account Taco East, with Eve on it, so Carl may open Taco Bell but not Taco
West. Carl makes a map of Taco Bell from its people (Tia, then Eve; Tom is
not his to see). Dana adds Tom and a line and saves first; Carl's save from
the same version is refused with 409; he reloads, Tom's node is there but
nameless, and his save goes through. Dana may not delete Carl's map; Carl
may."""

import json

from django.test import LiveServerTestCase

from e2e.http import http_delete, http_get, http_patch, http_post


class CanvasFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def created(self, path, payload, token):
        status, body = http_post(self.api(path), payload, token=token)
        self.assertEqual(status, 201, body)
        return body

    def login(self, email, password):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": password})
        self.assertEqual(status, 200, body)
        return body["access"]

    def test_full_flow(self):
        # 1. The workspace, Carl and Dana.
        status, body = http_post(
            self.api("/auth/signup/"),
            {
                "organisation_name": "Acme Inc",
                "name": "Alice Admin",
                "email": "alice@acme.io",
                "password": "supersecret1",
            },
        )
        self.assertEqual(status, 201, body)
        alice = body["access"]
        carl_id = self.created(
            "/auth/users/",
            {"name": "Carl CSM", "email": "carl@acme.io", "password": "csmpassword1"},
            alice,
        )["id"]
        self.created(
            "/auth/users/",
            {"name": "Dana CSM", "email": "dana@acme.io", "password": "csmpassword2"},
            alice,
        )
        carl = self.login("carl@acme.io", "csmpassword1")
        dana = self.login("dana@acme.io", "csmpassword2")

        # 2. Dana's Taco Bell and Taco West; Alice gives Carl Taco East.
        taco = self.created("/customers/", {"name": "Taco Bell"}, dana)["id"]
        west = self.created(f"/customers/{taco}/accounts/", {"name": "Taco West"}, dana)["id"]
        east = self.created(
            f"/customers/{taco}/accounts/", {"name": "Taco East", "owner_id": carl_id}, alice
        )["id"]
        tia = self.created(
            f"/customers/{taco}/contacts/",
            {"name": "Tia", "email": "tia@taco.example", "role": "champion"},
            dana,
        )["id"]
        tom = self.created(
            f"/customers/{taco}/accounts/{west}/contacts/",
            {"name": "Tom", "email": "tom@taco.example", "role": "decision_maker"},
            dana,
        )["id"]
        eve = self.created(
            f"/customers/{taco}/accounts/{east}/contacts/",
            {"name": "Eve", "email": "eve@taco.example", "role": "influencer"},
            carl,
        )["id"]

        # 3. Carl's map of Taco Bell from its people: Tom is not his to see.
        canvas = self.created(
            "/canvases/", {"name": "Taco map", "customer": taco, "start": "people"}, carl
        )
        self.assertEqual([n["data"]["contact_id"] for n in canvas["nodes"]], [tia, eve])
        self.assertEqual(
            (canvas["version"], canvas["can_delete"], canvas["hidden"], canvas["not_on_map"]),
            (1, True, [], []),
        )
        path = f"/canvases/{canvas['id']}/"

        # 4. Dana adds Tom and a line, and saves first.
        status, theirs = http_get(self.api(path), token=dana)
        self.assertEqual([p["name"] for p in theirs["not_on_map"]], ["Tom"])
        tom_node = {"id": f"c{tom}", "position": {"x": 240, "y": 0}, "data": {"contact_id": tom}}
        reports = {"id": "e1", "source": f"c{tom}", "target": f"c{tia}", "label": "Reports to"}
        status, body = http_patch(
            self.api(path),
            {"version": 1, "nodes": [*theirs["nodes"], tom_node], "edges": [reports]},
            token=dana,
        )
        self.assertEqual((status, body["version"]), (200, 2), body)

        # 5. Carl's save from version 1 is refused; he reloads and saves again.
        influences = {"id": "e2", "source": f"c{eve}", "target": f"c{tia}", "label": "Influences"}
        status, body = http_patch(self.api(path), {"version": 1, "edges": [influences]}, token=carl)
        self.assertEqual((status, body["code"]), (409, "CANVAS_CHANGED"))
        status, page = http_get(self.api(path), token=carl)
        self.assertEqual((page["version"], page["hidden"]), (2, [f"c{tom}"]))
        self.assertNotIn(str(tom), page["people_by_contact"])
        self.assertNotIn("Tom", json.dumps(page))
        status, body = http_patch(
            self.api(path),
            {"version": 2, "nodes": page["nodes"], "edges": [*page["edges"], influences]},
            token=carl,
        )
        self.assertEqual((status, body["version"], len(body["edges"])), (200, 3, 2), body)

        # 6. The lists.
        status, gallery = http_get(self.api("/canvases/"), token=carl)
        self.assertEqual([(r["id"], r["people"]) for r in gallery["results"]], [(canvas["id"], 3)])
        status, rows = http_get(self.api(f"/customers/{taco}/canvases/"), token=dana)
        self.assertEqual(rows["results"][0]["updated_by"]["name"], "Carl CSM")

        # 7. Dana may not delete Carl's map; Carl may.
        status, body = http_delete(self.api(path), token=dana)
        self.assertEqual(
            (status, body["detail"]),
            (403, "Only the map's creator or their managers can delete it."),
        )
        status, _ = http_delete(self.api(path), token=carl)
        self.assertEqual(status, 204)
        status, _ = http_get(self.api(path), token=carl)
        self.assertEqual(status, 404)
