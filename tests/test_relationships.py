"""
Comprehensive Relationships System Test Suite

Tests the full relationships system including:
- RelationshipGraph: Core graph operations, traversal, inference
- RelationshipStore: Advanced queries, aggregation, analytics
- RelationshipSync: Affiliation ↔ WorldRelationship bridging
- Integration: Actor, CognitiveOS, SharedWorld
"""
import pytest
from src.monkey_brain.kernel.relationships import (
    RelationshipGraph, Relationship, RelationshipKind,
    RelationshipDirection, RelationshipPath, RelationshipHistoryEntry,
)
from src.monkey_brain.kernel.relationships.store import RelationshipStore
from src.monkey_brain.kernel.relationships.sync import RelationshipSync
from src.monkey_brain.kernel.affiliations.affiliation import Affiliation
from src.monkey_brain.kernel.affiliations.manager import AffiliationManager
from src.monkey_brain.kernel.ontology.entity import Actor
from src.monkey_brain.kernel.cognitive_os.cognitive_os import CognitiveOS


# ═══════════════════════════════════════════════════════════════════════════════
# RelationshipGraph Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestRelationshipGraphCRUD:
    """Core graph CRUD operations"""

    def test_add_relationship(self):
        graph = RelationshipGraph()
        rel = graph.add("alice", "bob", "friendship", strength=0.8)
        assert graph.count() == 1
        assert rel.source_id == "alice"
        assert rel.target_id == "bob"

    def test_add_with_string_kind(self):
        graph = RelationshipGraph()
        rel = graph.add("alice", "bob", "colleague")
        assert rel.kind == RelationshipKind.COLLEAGUE

    def test_get_relationship(self):
        graph = RelationshipGraph()
        rel = graph.add("alice", "bob", "friendship")
        retrieved = graph.get(rel.relationship_id)
        assert retrieved is not None
        assert retrieved.source_id == "alice"

    def test_update_relationship(self):
        graph = RelationshipGraph()
        rel = graph.add("alice", "bob", "friendship", strength=0.5)
        updated = graph.update(rel.relationship_id, strength=0.9)
        assert updated.strength == 0.9

    def test_remove_relationship(self):
        graph = RelationshipGraph()
        rel = graph.add("alice", "bob", "friendship")
        assert graph.remove(rel.relationship_id) is True
        assert graph.count() == 0

    def test_remove_nonexistent(self):
        graph = RelationshipGraph()
        assert graph.remove("nonexistent") is False

    def test_strength_clamping(self):
        graph = RelationshipGraph()
        rel = graph.add("alice", "bob", "friendship", strength=1.5)
        assert rel.strength == 1.0

        rel2 = graph.add("alice", "charlie", "friendship", strength=-0.5)
        assert rel2.strength == 0.0


class TestRelationshipGraphQuery:
    """Graph query operations"""

    def _setup_graph(self):
        graph = RelationshipGraph()
        graph.add("alice", "bob", "friendship", strength=0.8)
        graph.add("alice", "charlie", "colleague", strength=0.6)
        graph.add("bob", "charlie", "colleague", strength=0.7)
        graph.add("charlie", "diana", "mentor", strength=0.9)
        return graph

    def test_relationships_for(self):
        graph = self._setup_graph()
        alice_rels = graph.relationships_for("alice")
        assert len(alice_rels) == 2

    def test_relationships_outgoing(self):
        graph = self._setup_graph()
        alice_out = graph.relationships_for("alice", RelationshipDirection.OUTGOING)
        assert all(r.source_id == "alice" for r in alice_out)

    def test_relationships_incoming(self):
        graph = self._setup_graph()
        charlie_in = graph.relationships_for("charlie", RelationshipDirection.INCOMING)
        assert all(r.target_id == "charlie" for r in charlie_in)

    def test_relationships_between(self):
        graph = self._setup_graph()
        rels = graph.relationships_between("alice", "bob")
        assert len(rels) == 1
        assert rels[0].kind == RelationshipKind.FRIENDSHIP

    def test_by_kind(self):
        graph = self._setup_graph()
        colleagues = graph.by_kind(RelationshipKind.COLLEAGUE)
        assert len(colleagues) == 2

    def test_by_attribute(self):
        graph = RelationshipGraph()
        graph.add("alice", "bob", "friendship", attributes={"team": "alpha"})
        graph.add("alice", "charlie", "colleague", attributes={"team": "beta"})
        alpha = graph.by_attribute("team", "alpha")
        assert len(alpha) == 1

    def test_strongest_relationship(self):
        graph = self._setup_graph()
        strongest = graph.strongest_relationship("alice")
        assert strongest.strength == 0.8

    def test_entities_connected_to(self):
        graph = self._setup_graph()
        connected = graph.entities_connected_to("alice")
        assert "bob" in connected
        assert "charlie" in connected

    def test_bidirectional(self):
        graph = RelationshipGraph()
        graph.add("alice", "bob", "friendship", bidirectional=True)
        # Should find relationship from both sides
        alice_rels = graph.relationships_for("alice")
        bob_rels = graph.relationships_for("bob")
        assert len(alice_rels) == 1
        assert len(bob_rels) == 1


class TestRelationshipGraphTraversal:
    """Graph traversal operations"""

    def _setup_chain(self):
        graph = RelationshipGraph()
        graph.add("alice", "bob", "colleague", strength=0.8)
        graph.add("bob", "charlie", "colleague", strength=0.7)
        graph.add("charlie", "diana", "colleague", strength=0.6)
        return graph

    def test_find_path(self):
        graph = self._setup_chain()
        path = graph.find_path("alice", "diana")
        assert path.exists
        assert path.hop_count == 3

    def test_find_path_direct(self):
        graph = self._setup_chain()
        path = graph.find_path("alice", "bob")
        assert path.exists
        assert path.hop_count == 1

    def test_find_path_no_path(self):
        graph = RelationshipGraph()
        graph.add("alice", "bob", "friendship")
        graph.add("charlie", "diana", "friendship")
        path = graph.find_path("alice", "diana")
        assert not path.exists

    def test_find_path_same_entity(self):
        graph = self._setup_chain()
        path = graph.find_path("alice", "alice")
        assert not path.exists

    def test_find_path_max_hops(self):
        graph = self._setup_chain()
        path = graph.find_path("alice", "diana", max_hops=2)
        assert not path.exists

    def test_all_paths(self):
        graph = RelationshipGraph()
        graph.add("alice", "bob", "friendship")
        graph.add("alice", "charlie", "friendship")
        graph.add("bob", "charlie", "colleague")
        paths = graph.all_paths("alice", "charlie")
        assert len(paths) >= 2


class TestRelationshipGraphInference:
    """Graph inference operations"""

    def test_transitive(self):
        graph = RelationshipGraph()
        graph.add("alice", "bob", "colleague", strength=0.8)
        graph.add("bob", "charlie", "colleague", strength=0.7)
        graph.add("charlie", "diana", "colleague", strength=0.6)

        transitive = graph.transitive("alice", RelationshipKind.COLLEAGUE)
        assert len(transitive) == 3

    def test_transitive_no_match(self):
        graph = RelationshipGraph()
        graph.add("alice", "bob", "friendship")
        graph.add("bob", "charlie", "colleague")

        transitive = graph.transitive("alice", RelationshipKind.COLLEAGUE)
        assert len(transitive) == 0

    def test_reverse_relationships(self):
        graph = RelationshipGraph()
        graph.add("alice", "bob", "superior")
        graph.add("charlie", "alice", "subordinate")

        incoming = graph.reverse_relationships("alice")
        assert len(incoming) == 1
        assert incoming[0].source_id == "charlie"


class TestRelationshipGraphHistory:
    """Graph history operations"""

    def test_history_created(self):
        graph = RelationshipGraph()
        rel = graph.add("alice", "bob", "friendship")
        history = graph.history(relationship_id=rel.relationship_id)
        assert len(history) == 1
        assert history[0].action == "create"

    def test_history_updated(self):
        graph = RelationshipGraph()
        rel = graph.add("alice", "bob", "friendship")
        graph.update(rel.relationship_id, strength=0.9)
        history = graph.history(relationship_id=rel.relationship_id)
        assert len(history) == 2
        assert history[0].action == "update"

    def test_history_deleted(self):
        graph = RelationshipGraph()
        rel = graph.add("alice", "bob", "friendship")
        graph.remove(rel.relationship_id)
        history = graph.history(relationship_id=rel.relationship_id)
        assert len(history) == 2
        assert history[0].action == "delete"

    def test_history_by_action(self):
        graph = RelationshipGraph()
        rel = graph.add("alice", "bob", "friendship")
        graph.update(rel.relationship_id, strength=0.9)
        graph.remove(rel.relationship_id)

        creates = graph.history(action="create")
        updates = graph.history(action="update")
        deletes = graph.history(action="delete")
        assert len(creates) == 1
        assert len(updates) == 1
        assert len(deletes) == 1


class TestRelationshipGraphSerialization:
    """Graph serialization"""

    def test_to_dict(self):
        graph = RelationshipGraph()
        graph.add("alice", "bob", "friendship")
        data = graph.to_dict()
        assert "relationships" in data
        assert len(data["relationships"]) == 1

    def test_from_dict(self):
        data = {
            "relationships": [
                {
                    "relationship_id": "rel_001",
                    "source_id": "alice",
                    "target_id": "bob",
                    "kind": "friendship",
                    "strength": 0.8,
                }
            ]
        }
        graph = RelationshipGraph.from_dict(data)
        assert graph.count() == 1

    def test_roundtrip(self):
        graph = RelationshipGraph()
        graph.add("alice", "bob", "friendship", strength=0.8)
        graph.add("bob", "charlie", "colleague", strength=0.6)

        data = graph.to_dict()
        graph2 = RelationshipGraph.from_dict(data)
        assert graph2.count() == 2


class TestRelationshipGraphStats:
    """Graph statistics"""

    def test_stats(self):
        graph = RelationshipGraph()
        graph.add("alice", "bob", "friendship")
        graph.add("alice", "charlie", "colleague")
        graph.add("bob", "charlie", "colleague")

        stats = graph.stats()
        assert stats["total_relationships"] == 3
        assert stats["unique_entities"] == 3
        assert stats["by_kind"]["friendship"] == 1
        assert stats["by_kind"]["colleague"] == 2


# ═══════════════════════════════════════════════════════════════════════════════
# RelationshipStore Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestRelationshipStore:
    """Advanced store operations"""

    def test_add_with_indexing(self):
        store = RelationshipStore()
        rel = store.add("alice", "bob", "friendship", strength=0.8)
        assert store.graph.count() == 1

    def test_find_multiple_filters(self):
        store = RelationshipStore()
        store.add("alice", "bob", "friendship", strength=0.8)
        store.add("alice", "charlie", "colleague", strength=0.6)
        store.add("bob", "charlie", "colleague", strength=0.7)

        results = store.find(source_id="alice", kind=RelationshipKind.COLLEAGUE)
        assert len(results) == 1

    def test_find_strength_range(self):
        store = RelationshipStore()
        store.add("alice", "bob", "friendship", strength=0.3)
        store.add("alice", "charlie", "friendship", strength=0.7)

        results = store.find(min_strength=0.5)
        assert len(results) == 1

    def test_find_mutual(self):
        store = RelationshipStore()
        store.add("alice", "bob", "friendship", strength=0.8)
        store.add("bob", "alice", "friendship", strength=0.7)

        mutual = store.find_mutual("alice", "bob")
        assert len(mutual) == 2

    def test_count_by_kind(self):
        store = RelationshipStore()
        store.add("alice", "bob", "friendship")
        store.add("alice", "charlie", "colleague")
        store.add("bob", "charlie", "colleague")

        counts = store.count_by_kind()
        assert counts["friendship"] == 1
        assert counts["colleague"] == 2

    def test_average_strength(self):
        store = RelationshipStore()
        store.add("alice", "bob", "friendship", strength=0.6)
        store.add("alice", "charlie", "friendship", strength=0.8)

        avg = store.average_strength(RelationshipKind.FRIENDSHIP)
        assert avg == 0.7

    def test_strength_distribution(self):
        store = RelationshipStore()
        store.add("alice", "bob", "friendship", strength=0.9)  # strong
        store.add("alice", "charlie", "colleague", strength=0.6)  # medium
        store.add("bob", "charlie", "peer", strength=0.3)  # weak

        dist = store.strength_distribution()
        assert dist["strong"] == 1
        assert dist["medium"] == 1
        assert dist["weak"] == 1

    def test_most_connected(self):
        store = RelationshipStore()
        store.add("alice", "bob", "friendship")
        store.add("alice", "charlie", "colleague")
        store.add("alice", "diana", "peer")
        store.add("bob", "charlie", "colleague")

        top = store.most_connected(1)
        assert top[0][0] == "alice"
        assert top[0][1] == 3

    def test_add_bulk(self):
        store = RelationshipStore()
        rels = store.add_bulk([
            {"source_id": "alice", "target_id": "bob", "kind": "friendship"},
            {"source_id": "alice", "target_id": "charlie", "kind": "colleague"},
        ])
        assert len(rels) == 2

    def test_remove_by_entity(self):
        store = RelationshipStore()
        store.add("alice", "bob", "friendship")
        store.add("alice", "charlie", "colleague")
        store.add("bob", "charlie", "peer")

        removed = store.remove_by_entity("alice")
        assert removed == 2
        assert store.graph.count() == 1

    def test_analytics(self):
        store = RelationshipStore()
        store.add("alice", "bob", "friendship", strength=0.8)
        store.add("alice", "charlie", "colleague", strength=0.6)

        analytics = store.analytics()
        assert "total_relationships" in analytics
        assert "count_by_kind" in analytics
        assert "average_strength" in analytics


# ═══════════════════════════════════════════════════════════════════════════════
# RelationshipSync Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestRelationshipSync:
    """Affiliation ↔ Relationship synchronization"""

    def test_affiliation_to_relationship(self):
        sync = RelationshipSync()
        aff = Affiliation(
            affiliation_id="aff_001",
            affiliation_type="friendship",
            target_id="bob",
            target_name="Bob",
            trust_level=0.8,
        )
        rel = sync.affiliation_to_relationship(aff, "alice")
        assert rel.source_id == "alice"
        assert rel.target_id == "bob"
        assert rel.kind == RelationshipKind.FRIENDSHIP
        assert rel.strength == 0.8

    def test_sync_affiliation(self):
        sync = RelationshipSync()
        aff = Affiliation(
            affiliation_id="aff_001",
            affiliation_type="friendship",
            target_id="bob",
            target_name="Bob",
            trust_level=0.8,
        )
        rel = sync.sync_affiliation(aff, "alice")
        assert sync.graph.count() == 1

    def test_sync_affiliation_update(self):
        sync = RelationshipSync()
        aff = Affiliation(
            affiliation_id="aff_001",
            affiliation_type="friendship",
            target_id="bob",
            target_name="Bob",
            trust_level=0.5,
        )
        sync.sync_affiliation(aff, "alice")

        # Update
        aff_updated = Affiliation(
            affiliation_id="aff_001",
            affiliation_type="friendship",
            target_id="bob",
            target_name="Bob",
            trust_level=0.9,
        )
        sync.sync_affiliation(aff_updated, "alice")

        assert sync.graph.count() == 1
        rels = sync.graph.relationships_between("alice", "bob")
        assert rels[0].strength == 0.9

    def test_sync_affiliation_manager(self):
        sync = RelationshipSync()
        mgr = AffiliationManager()
        mgr.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="bob", target_name="Bob", trust_level=0.8,
        ))
        mgr.add(Affiliation(
            affiliation_id="aff_002", affiliation_type="colleague",
            target_id="charlie", target_name="Charlie", trust_level=0.6,
        ))

        count = sync.sync_affiliation_manager(mgr, "alice")
        assert count == 2
        assert sync.graph.count() == 2

    def test_relationship_to_affiliation(self):
        sync = RelationshipSync()
        rel = Relationship(
            source_id="alice", target_id="bob",
            kind=RelationshipKind.FRIENDSHIP, strength=0.8,
        )
        aff = sync.relationship_to_affiliation(rel)
        assert aff.target_id == "bob"
        assert aff.trust_level == 0.8

    def test_sync_to_affiliation_manager(self):
        sync = RelationshipSync()
        sync.graph.add("alice", "bob", "friendship", strength=0.8)
        sync.graph.add("alice", "charlie", "colleague", strength=0.6)

        mgr = AffiliationManager()
        count = sync.sync_to_affiliation_manager(mgr, "alice")
        assert count == 2

    def test_resolve_conflict_strongest(self):
        sync = RelationshipSync()
        aff = Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="bob", target_name="Bob", trust_level=0.9,
        )
        rel = Relationship(
            source_id="alice", target_id="bob",
            kind=RelationshipKind.FRIENDSHIP, strength=0.5,
        )
        resolved = sync.resolve_conflict(aff, rel, strategy="strongest")
        assert resolved.strength == 0.9

    def test_resolve_conflict_affiliation(self):
        sync = RelationshipSync()
        aff = Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="bob", target_name="Bob", trust_level=0.3,
        )
        rel = Relationship(
            source_id="alice", target_id="bob",
            kind=RelationshipKind.FRIENDSHIP, strength=0.8,
        )
        resolved = sync.resolve_conflict(aff, rel, strategy="affiliation")
        assert resolved.strength == 0.3

    def test_disable_sync(self):
        sync = RelationshipSync()
        sync.disable_sync()
        aff = Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="bob", target_name="Bob",
        )
        result = sync.sync_affiliation(aff, "alice")
        assert result is None


# ═══════════════════════════════════════════════════════════════════════════════
# Integration Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestActorIntegration:
    """Integration with Actor class"""

    def test_actor_relationship_graph(self):
        graph = RelationshipGraph()
        graph.add("alice", "bob", "friendship", strength=0.8)
        graph.add("alice", "charlie", "colleague", strength=0.6)

        alice_rels = graph.relationships_for("alice")
        assert len(alice_rels) == 2

    def test_actor_find_connection(self):
        graph = RelationshipGraph()
        graph.add("alice", "bob", "friendship")
        graph.add("bob", "charlie", "colleague")
        graph.add("charlie", "diana", "mentor")

        path = graph.find_path("alice", "diana")
        assert path.exists
        assert path.hop_count == 3


class TestCognitiveOSIntegration:
    """Integration with CognitiveOS"""

    def test_os_relationship_check(self):
        os = CognitiveOS()
        a = Actor(entity_id="alice")
        os.set_actor(a)

        # Add relationship via manager
        a.affiliations.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="bob", target_name="Bob", trust_level=0.8,
        ))

        # Check trust via OS
        assert os._check_trust("bob") is True

    def test_os_relationship_block(self):
        os = CognitiveOS()
        a = Actor(entity_id="alice")
        os.set_actor(a)

        a.affiliations.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="enemy", target_name="Enemy", trust_level=0.1,
        ))

        assert os._check_trust("enemy") is False


# ═══════════════════════════════════════════════════════════════════════════════
# Stress Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestRelationshipStress:
    """Stress tests for relationships system"""

    def test_hundred_relationships(self):
        graph = RelationshipGraph()
        for i in range(100):
            graph.add(f"entity_{i}", f"entity_{i+1}", "related_to", strength=0.5)
        assert graph.count() == 100

    def test_traversal_performance(self):
        import time
        graph = RelationshipGraph()
        for i in range(50):
            graph.add(f"node_{i}", f"node_{i+1}", "related_to", strength=0.5)

        start = time.time()
        for _ in range(100):
            graph.find_path("node_0", "node_50")
        elapsed = time.time() - start
        assert elapsed < 5.0

    def test_large_graph_stats(self):
        graph = RelationshipGraph()
        for i in range(200):
            kind = ["friendship", "colleague", "peer"][i % 3]
            graph.add(f"entity_{i}", f"entity_{i+1}", kind, strength=0.5)

        stats = graph.stats()
        assert stats["total_relationships"] == 200
        assert stats["unique_entities"] == 201
