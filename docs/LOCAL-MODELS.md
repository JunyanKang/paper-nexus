# Local model architecture and provenance

Paper Nexus 1.0 separates the XPI, public data-only model packs, and the user's private index. End-user instructions are in [Installation](INSTALL.md).

## Portable runtime

The same XPI and `.pnmodel` archives are used on macOS and Windows. Inference runs in Zotero's privileged worker using ONNX Runtime Web 1.30.0, single-threaded WebAssembly. The plugin requires no native helper, Python interpreter, shell script or background server. The optional standalone Cocoa / Windows Forms installer downloads both models and the XPI; it does not remain running after setup. The XPI ships the JavaScript loader; each model pack includes its matching WASM runtime, tokenizer, weights and licenses.

By default, models live under the Zotero data directory in `paper-nexus-models/<id>/<version>`. An atomic active pointer selects a verified version. Installation checks exact archive entries, sizes and SHA256 digests; installer downloads use SHA256-pinned GitHub Pages downloads. The in-plugin downloader uses those same packages for bundled profiles; file-level pinned upstream URLs remain in the provenance catalog for reproducible pack builds. Download cancellation and rejected archives retain the existing active model. Plugin updates preserve this directory. The initial upgrade from an older bundled-model XPI requires installing a separate model pack once.

## Included profiles

| Profile | Upstream | Encoding | Pack bytes |
|---|---|---|---:|
| Lightweight, default | [all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/751bff37182d3f1213fa05d7196b954e230abad9) | INT8, 384 dimensions, masked mean pooling; title and abstract chunks, 256 tokens | 20,133,091 |
| Biomedical, optional | [MedEmbed-small-v0.1](https://huggingface.co/abhinand/MedEmbed-small-v0.1/tree/40a5850d046cfdb56154e332b4d7099b63e8d50e) | INT8, 384 dimensions; exported sentence embedding; joint title and abstract, 384 tokens | 28,996,591 |

The biomedical pack uses the pinned [medbrevia ONNX export](https://huggingface.co/medbrevia/medembed-small-v0.1-onnx-int8/tree/6cbe4664f1e0067da935f5abc24e4f8b5406b13f), with its provenance and Apache-2.0 / upstream BGE MIT notices. This is an integration of an existing trained model, not a newly trained Nexus foundation model. The biomedical input is truncated at the token limit; the lightweight path splits longer abstracts. Retrieval improvement does not establish superior scientific clustering for every library.

The public [catalog](../model-catalog.json) is the source of exact file sizes, revisions and hashes. Run `python scripts/build_models.py` to reproduce the packs from these pinned files. Model binaries and personal indexes are excluded from Git. Building the XPI does not download model weights.

## Resource use and incremental work

A shared inference lane prevents one model per network window. The worker is reused across batches, releases tensors after each batch, and terminates after eight idle seconds. Token-length batching reduces padded computation. Canceling a job terminates its worker.

Vectors are keyed by model identity and text content, stored as little-endian Float32 chunks of at most 96 vectors. A small atomic index points to immutable chunks. New or changed text appends chunks; unchanged chunks are not rewritten. The disk index is bounded to 12,000 entries; missing or damaged chunks are recomputed. A failed index commit preserves the prior readable generation. Compatible old MiniLM JSON vectors are imported once and the original cache is retained for rollback.

A 255-byte SIMD kernel accelerates exact dot products for 384-dimensional networks. The scalar implementation remains available if SIMD is unavailable or the input shape is unsupported. Rebuild it with WABT 1.0.39 and `node scripts/build_kernel.cjs <path-to-wabt-module>`; the checked-in WAT is authoritative. No WABT dependency ships to users.

## Measurements and support status

See [Validation](VALIDATION.md) for measured speed, retrieval quality, memory, platform coverage and unresolved limitations. The default remains MiniLM because the first MedEmbed benchmark did not meet the predeclared quality and memory promotion gates. Windows CI validates source and packaging; it does not substitute for a real Windows Zotero installation test.

## Standalone installers

Both platform assistants embed only the pinned download catalog and compact OFL-licensed
UI font subset. The XPI and weights are downloaded and SHA256-verified. At least one model must be selected; a
user may select multiple. Each model has separate waiting, download, verification,
installation and completed states. The installer verifies the archive before
extraction and every file before committing the active pointer. A portable CLI is
used by platform CI only against temporary data directories. Windows CI executes
the native EXE; this is separate from Windows Zotero runtime verification.

The plugin discovers complete active models when settings open; installed choices
and downloadable choices are separate. A sole biomedical installation is selected
automatically when the preferred model is unavailable. Neither installer writes
Zotero's database or modifies plugin security preferences. The final XPI handoff
uses Zotero's official Install Plugin From File interface.

A folder picker can select another existing model root. After a verified install, the installer atomically writes `paper-nexus-model-location.json` in the Zotero data directory. The plugin reads this on startup and when opening settings, and offers its own folder picker. Changing roots cancels stale inference and refreshes installed model choices; it does not move existing files. An unavailable external drive is reported without silently falling back to a different directory.


## Complete local and API network modes

Local mode performs both semantic grouping and extractive topic naming without an API key. API mode supplies batches of at most 24 new or edited titles/abstracts and up to 64 candidate existing topics; the model decides memberships and scientific names. Existing memberships are reused, not globally reclassified on each addition. Embeddings still provide local similarity links and layout. API failures retain local results and are identified in the UI.

Author nodes always represent locally resolved bibliographic identities. Local mode partitions the evidence-backed coauthor graph. API mode may partition connected coauthor components of at most 80 authors and choose an existing representative; disconnected groups, unknown identities, duplicated memberships, and missing members are rejected. Larger consortium components use the local worker. Results are cached by provider, endpoint, model, identities, context and evidence; changes affect the corresponding component. The model cannot create coauthor evidence.

Completed scoped graphs and parsed PDF references use a separate atomic disk cache, bounded to 64 files / 64 MiB, with a 12 MiB file-read limit. Serialization and parsing run in a worker. Scope, mode, model identity, content form the cache key. PDF identity includes attachment identity, file size, modification time and PDF fingerprint. Reference caches retain only citation-relevant coordinates rather than every page glyph. On restart, metadata is reconciled with Zotero before the matching graph is reused; this is not a zero-I/O startup guarantee.

The network contains only papers in the selected local library or collection. Existing parsed bibliographies may establish citation edges between those papers; they never create external nodes. Author resolution, graph computation and layout run in workers. Metadata changes can still require worker-side recomputation of affected groups.

The product release exposes only a macOS DMG and Windows EXE. The DMG contains the standalone app, which runs directly from the mounted image. XPI, model packs and update metadata are served from a separate Pages distribution branch. Versioned artifacts are immutable; the root update manifest advances with each release. Versions through 1.0.1 require one installer-mediated migration because their update URL points to a release asset.
