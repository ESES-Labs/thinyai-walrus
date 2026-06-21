/// On-chain "memory head" — a verifiable, ownable pointer to an AI agent's current brain on Walrus.
///
/// The agent's transcript and audit log live as content-addressed Walrus blobs; this object records
/// *which* blobs are current. Anyone can read it (verify the agent's latest state); only the owner
/// can update it (ownership + the ability to revoke/rotate). This is the spine of the Thiny × Walrus
/// "verifiable + portable memory" story — the pointer that replaces a local pointer.json.
module memory_head::memory_head;

use std::string::{Self, String};

/// The transaction sender is not the owner of this memory head.
const ENotOwner: u64 = 0;

/// A shared object holding the latest Walrus blob pointers for one agent.
public struct MemoryHead has key {
    id: UID,
    owner: address,
    latest_transcript_blob: String,
    latest_audit_blob: String,
    updated_at_ms: u64,
}

/// Emitted on every update so indexers can follow an agent's brain over time.
public struct Updated has copy, drop {
    head: address,
    latest_transcript_blob: String,
    latest_audit_blob: String,
    updated_at_ms: u64,
}

/// Create and share a new memory head owned by the caller.
/// Shared so the pointer is publicly readable; writes stay gated to the owner.
public entry fun create(ctx: &mut TxContext) {
    let head = MemoryHead {
        id: object::new(ctx),
        owner: ctx.sender(),
        latest_transcript_blob: string::utf8(b""),
        latest_audit_blob: string::utf8(b""),
        updated_at_ms: 0,
    };
    transfer::share_object(head);
}

/// Owner-gated update of the latest blob pointers. Aborts with `ENotOwner` for anyone else.
public entry fun update(
    head: &mut MemoryHead,
    transcript_blob: vector<u8>,
    audit_blob: vector<u8>,
    updated_at_ms: u64,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == head.owner, ENotOwner);
    head.latest_transcript_blob = string::utf8(transcript_blob);
    head.latest_audit_blob = string::utf8(audit_blob);
    head.updated_at_ms = updated_at_ms;
    sui::event::emit(Updated {
        head: object::uid_to_address(&head.id),
        latest_transcript_blob: head.latest_transcript_blob,
        latest_audit_blob: head.latest_audit_blob,
        updated_at_ms,
    });
}

// ── Public read accessors (object fields are also readable directly via RPC) ──
public fun owner(head: &MemoryHead): address { head.owner }
public fun latest_transcript_blob(head: &MemoryHead): String { head.latest_transcript_blob }
public fun latest_audit_blob(head: &MemoryHead): String { head.latest_audit_blob }
public fun updated_at_ms(head: &MemoryHead): u64 { head.updated_at_ms }
