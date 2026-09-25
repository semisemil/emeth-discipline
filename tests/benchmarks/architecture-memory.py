"""Measure retrieval output, not total agent usage. Requires tiktoken; run from any cwd."""

import json
import argparse
import hashlib
from pathlib import Path
import subprocess
import tempfile
import time

import tiktoken


ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / "skills/architecture-memory/scripts/memory.js"
ENCODING = tiktoken.get_encoding("o200k_base")


def tokens(text):
    return len(ENCODING.encode(text))


entrypoint = (ROOT / "skills/architecture-memory/SKILL.md").read_text(encoding="utf-8")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--before-dir", type=Path, help="Saved pre-edit prompts; optional, never inferred from Git HEAD")
args = parser.parse_args()
prompt_files = [
    "skills/architecture-memory/SKILL.md",
    "skills/architecture-memory/references/recording.md",
    "skills/architecture-memory/references/retrieval.md",
    "skills/architecture-memory-init/SKILL.md",
    "skills/architecture-memory-init/references/initialization.md",
    "skills/architecture-memory-update/SKILL.md",
    "skills/architecture-memory/references/record-format.md",
    "skills/architecture-memory/references/workflow.md",
]
prompts = []
for name in prompt_files:
    current = (ROOT / name).read_text(encoding="utf-8")
    old_file = args.before_dir / name if args.before_dir else None
    old = old_file.read_text(encoding="utf-8") if old_file and old_file.exists() else None
    prompts.append({"path": name, "before_tokens": tokens(old) if old is not None else None,
                    "after_tokens": tokens(current), "before_sha256": hashlib.sha256(old.encode()).hexdigest() if old is not None else None})
print(json.dumps({"type": "prompts", "tokenizer": "o200k_base", "files": prompts}))
for unrelated_count in (0, 8, 80):
    with tempfile.TemporaryDirectory(prefix="emeth-memory-benchmark-") as directory:
        project = Path(directory)
        architecture = project / "docs/architecture"
        (architecture / ".architecture-memory").mkdir(parents=True)
        contents = {
            "selected.md": '## 현장 단말\n<!-- am: {"id":"AM-terminal","terms":["키오스크"]} -->\n\n'
            '**confirmed/current**\n\n망 점검 중에도 접수를 계속한다. 마지막 동기화 시점을 표시한다. '
            '근거: 사용자, 현장 설명.\n'
        }
        for index in range(unrelated_count):
            contents[f"other-{index}.md"] = (
                f'## Subsystem {index}\n<!-- am: {{"id":"AM-other-{index}"}} -->\n\n'
                '**confirmed/current**\n\n' + 'Unrelated subsystem detail. ' * 150 + '\n'
            )
        manifest = {
            "schema_version": 2, "managed": True, "language": "ko",
            "git_checkpoint": {"revision": None, "branch_at_check": None, "checked_at": None},
            "documents": [],
        }
        for index, (name, body) in enumerate(contents.items()):
            (architecture / name).write_text(body, encoding="utf-8")
            manifest["documents"].append({
                "id": f"doc-{index}", "kind": "context", "path": name, "order": index,
                "verified_at": None, "source_revision": None,
            })
        (architecture / ".architecture-memory/manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        started = time.monotonic()
        found = subprocess.check_output([
            "node", str(CLI), "search", "--project-root", directory, "--query", "키오스크"
        ]).decode("utf-8")
        candidates = json.loads(found)
        body = subprocess.check_output([
            "node", str(CLI), "read", "--project-root", directory,
            "--id", candidates["matches"][0]["id"], "--revision", candidates["revision"]
        ]).decode("utf-8")
        selected = json.loads(body)
        assert selected["complete"]
        assert len(selected["documents"]) == 1
        assert "망 점검" in selected["documents"][0]["sections"][0]["text"]
        print(json.dumps({
            "type": "retrieval_scale",
            "documents": len(contents),
            "full_markdown_tokens": sum(tokens(text) for text in contents.values()),
            "search_read_tokens": tokens(found) + tokens(body),
            "with_entrypoint_tokens": tokens(entrypoint) + tokens(found) + tokens(body),
            "elapsed_ms": round((time.monotonic() - started) * 1000),
        }))


def make_corpus(project, contents):
    architecture = project / "docs/architecture"
    (architecture / ".architecture-memory").mkdir(parents=True)
    docs = []
    for index, (name, text) in enumerate(contents.items()):
        (architecture / name).write_text(text, encoding="utf-8")
        docs.append({"id": f"doc-{index}", "kind": "context", "path": name, "order": index,
                     "verified_at": None, "source_revision": None})
    (architecture / ".architecture-memory/manifest.json").write_text(json.dumps({
        "schema_version": 2, "managed": True, "language": "en", "documents": docs,
        "git_checkpoint": {"revision": None, "branch_at_check": None, "checked_at": None},
    }), encoding="utf-8")


def section(identity, body, **metadata):
    return f'## {identity}\n<!-- am: {json.dumps({"id": identity, **metadata})} -->\n\n**confirmed/current**\n\n{body}\n'


def measured_read(project, ids, seen=(), cap=12000, cursor=None):
    options = ["read", "--project-root", str(project), "--max-chars", str(cap)]
    for identity in ids:
        options.extend(["--id", identity])
    for receipt in seen:
        options.extend(["--seen", receipt])
    if cursor:
        options.extend(["--cursor", cursor])
    output = subprocess.check_output(["node", str(CLI), *options]).decode("utf-8")
    request = json.dumps(["node", "<memory.js>", *options]).replace(json.dumps(str(project))[1:-1], "<project>")
    return json.loads(output), tokens(request), tokens(output)


with tempfile.TemporaryDirectory(prefix="emeth-memory-shared-") as directory:
    project = Path(directory)
    contents = {"global.md": section("AM-global", "Shared requirement and its operating exception. " * 90, always=True)}
    contents.update({f"owner-{i}.md": section(f"AM-owner-{i}", "Owner-specific context. " * 12) for i in range(5)})
    make_corpus(project, contents)
    for reuse in (False, True):
        seen = []
        request_tokens = response_tokens = 0
        for i in range(5):
            result, request, response = measured_read(project, [f"AM-owner-{i}"], seen if reuse else [])
            assert result["complete"]
            seen.extend(item["receipt"] for doc in result["documents"] for item in doc["sections"] if item["id"] == "AM-global")
            request_tokens += request
            response_tokens += response
        print(json.dumps({"type": "shared_context", "owners": 5, "reuse_receipts": reuse,
                          "request_tokens": request_tokens, "response_tokens": response_tokens,
                          "io_tokens": request_tokens + response_tokens}))

with tempfile.TemporaryDirectory(prefix="emeth-memory-fanout-") as directory:
    project = Path(directory)
    dependencies = [f"AM-required-{i}" for i in range(25)]
    text = section("AM-root", "Required conditions follow.", links=dependencies)
    text += "\n".join(section(identity, "Necessary condition and its exception. " * 45) for identity in dependencies)
    make_corpus(project, {"graph.md": text})
    for strategy in ("accumulated_receipts", "cursor"):
        seen = []
        cursor = None
        requests = responses = calls = 0
        while True:
            result, request, response = measured_read(project, ["AM-root"], seen if strategy == "accumulated_receipts" else [], 6000, cursor)
            delivered = [item for doc in result["documents"] for item in doc["sections"]]
            assert delivered and calls < 30
            seen.extend(item["receipt"] for item in delivered)
            calls += 1
            requests += request
            responses += response
            if strategy == "cursor":
                cursor = result["next_cursor"]
            if result["complete"]:
                break
        assert len(seen) == 26
        print(json.dumps({"type": "dependency_fanout", "strategy": strategy, "records": 26, "calls": calls,
                          "source_tokens": tokens(text), "request_tokens": requests,
                          "response_tokens": responses, "io_tokens": requests + responses}))

workflow = json.loads(subprocess.check_output(["node", str(ROOT / "tests/benchmarks/architecture-memory-workflow.js")]).decode("utf-8"))
segments = {}
for frame in workflow["frames"]:
    segment = segments.setdefault(frame["segment"], {"calls": 0, "request_tokens": 0, "response_tokens": 0})
    segment["calls"] += 1
    segment["request_tokens"] += tokens(frame["request"])
    segment["response_tokens"] += tokens(frame["response"])
print(json.dumps({"type": "workflow_io", "segments": segments}))
print(json.dumps({"type": "connection", "turns": 20,
                  "uninitialized_notice_tokens": sum(tokens(text) for text in workflow["uninitialized_notices"]),
                  "initialized_notice_tokens": sum(tokens(text) for text in workflow["initialized_notices"])}))
