import {
  AppEvents,
  Button,
  List,
  Navigation,
  NavigationStack,
  Path,
  Script,
  Section,
  SecureField,
  Text,
  TextField,
  useEffect,
  useState,
  fetch,
} from "scripting"

const VERSION = "1.4.1"
const TUNNEL_WIRE_VERSION = "2026-08-25"
const API_BASE = "https://api.openai.com"
const STORAGE_TUNNEL_ID = "openai_tunnel_id"
const STORAGE_TUNNEL_RUNTIME = "scriptingplus_tunnel_runtime_v1"
const KEYCHAIN_API_KEY = "openai_tunnel_runtime_api_key"

const CLIENT_NAME = "scripting-tunnel-client"
const USER_AGENT = `${CLIENT_NAME}/${VERSION}`
const CLIENT_CAPABILITIES = "wrong-cluster-v1"
const POLL_LIMIT = 20
const MAX_READ_FILE_BYTES = 2 * 1024 * 1024
const MAX_WRITE_FILE_BYTES = 2 * 1024 * 1024
const MAX_DELETE_FILE_BYTES = 2 * 1024 * 1024
const MAX_SEARCH_FILE_BYTES = 2 * 1024 * 1024
const MAX_TREE_ENTRIES = 1000
const MAX_SEARCH_FILES = 1000
const MAX_SEARCH_DIRECTORIES = 1000
const MAX_SEARCH_RESULTS = 100
const MAX_SEARCH_PREVIEW_CHARS = 240
const MAX_RUN_RESULT_BYTES = 256 * 1024
const MAX_RUN_QUERY_PARAMETERS = 50
const MAX_PATH_MUTATION_ENTRIES = 1000
const MAX_PATH_MUTATION_BYTES = 8 * 1024 * 1024
const MAX_VALIDATE_ENTRIES = 2000
const MAX_VALIDATE_ISSUES = 200
const MAX_HASH_ENTRIES = 2000
const MAX_HASH_BYTES = 32 * 1024 * 1024
const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 1000
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 8 * 1024 * 1024
const MAX_COMPRESSED_REPLACE_BASE64_CHARS = 4 * 1024 * 1024
const MAX_RESOURCE_BASE64_CHARS = 3 * 1024 * 1024
const CHANGE_PREVIEW_TTL_MS = 10 * 60 * 1000
const MAX_PENDING_CHANGE_PREVIEWS = 20
const TUNNEL_RUNTIME_HEARTBEAT_MS = 2000
const TUNNEL_RUNTIME_STALE_MS = 15000
const MAX_ROUTING_FAILURES = 3
const MCP_MODERN_VERSION = "2026-07-28"
const MCP_LEGACY_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
]

// Ordinary HTTP Streamable MCP uses the main v1 channel declaration.
const MCP_SERVER_INFO = JSON.stringify({
  version: 1,
  channels: [{ name: "main" }],
})

const SCRIPTING_STATUS_TOOL = {
  description:
    "Return the current Scripting Secure MCP Tunnel runtime status. Read-only; never returns credentials or the Tunnel ID.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
  },
  name: "scripting_status",
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      version: { type: "string" },
      environment: { type: "string" },
      tunnel: { type: "string" },
      wire_protocol: { type: "string" },
      background_keep_alive: { type: "boolean" },
    },
    required: [
      "ok",
      "version",
      "environment",
      "tunnel",
      "wire_protocol",
      "background_keep_alive",
    ],
    additionalProperties: false,
  },
}


const SCRIPTING_PROJECTS_TOOL = {
  description:
    "List Scripting projects from FileManager.scriptsDirectory. Read-only; returns project names and detected entry files only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
  },
  name: "scripting_projects",
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      count: { type: "integer" },
      projects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            entrypoints: { type: "array", items: { type: "string" } },
            has_manifest: { type: "boolean" },
          },
          required: ["name", "entrypoints", "has_manifest"],
          additionalProperties: false,
        },
      },
    },
    required: ["ok", "count", "projects"],
    additionalProperties: false,
  },
}

const SCRIPTING_READ_TOOL = {
  description:
    "Read a UTF-8 text file inside one Scripting project. Paths are confined to FileManager.scriptsDirectory and symbolic links are rejected. Returns a bounded line window.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", minLength: 1 },
      path: { type: "string", minLength: 1 },
      start_line: { type: "integer", minimum: 1 },
      max_lines: { type: "integer", minimum: 1, maximum: 500 },
    },
    required: ["project", "path"],
    additionalProperties: false,
  },
  name: "scripting_read",
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      project: { type: "string" },
      path: { type: "string" },
      content: { type: "string" },
      start_line: { type: "integer" },
      end_line: { type: "integer" },
      total_lines: { type: "integer" },
      truncated: { type: "boolean" },
      size_bytes: { type: "integer" },
    },
    required: [
      "ok",
      "project",
      "path",
      "content",
      "start_line",
      "end_line",
      "total_lines",
      "truncated",
      "size_bytes",
    ],
    additionalProperties: false,
  },
}


const SCRIPTING_TREE_TOOL = {
  description:
    "List a bounded project tree without following symbolic links. Use path to start from a subdirectory, max_depth to limit recursion, and max_entries to cap output.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", minLength: 1 },
      path: { type: "string" },
      max_depth: { type: "integer", minimum: 1, maximum: 20 },
      max_entries: { type: "integer", minimum: 1, maximum: MAX_TREE_ENTRIES },
    },
    required: ["project"],
    additionalProperties: false,
  },
  name: "scripting_tree",
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      project: { type: "string" },
      path: { type: "string" },
      count: { type: "integer" },
      truncated: { type: "boolean" },
      max_depth: { type: "integer" },
      max_entries: { type: "integer" },
      entries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string" },
            type: { type: "string", enum: ["file", "directory", "link"] },
            size_bytes: { type: "integer" },
          },
          required: ["path", "type", "size_bytes"],
          additionalProperties: false,
        },
      },
    },
    required: ["ok", "project", "path", "count", "truncated", "max_depth", "max_entries", "entries"],
    additionalProperties: false,
  },
}

const SCRIPTING_SEARCH_TOOL = {
  description:
    "Search plain text inside one Scripting project without following symbolic links. Binary and oversized files are skipped; results and scanned files are bounded.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", minLength: 1 },
      query: { type: "string", minLength: 1, maxLength: 512 },
      path: { type: "string" },
      case_sensitive: { type: "boolean" },
      max_results: { type: "integer", minimum: 1, maximum: MAX_SEARCH_RESULTS },
      max_files: { type: "integer", minimum: 1, maximum: MAX_SEARCH_FILES },
    },
    required: ["project", "query"],
    additionalProperties: false,
  },
  name: "scripting_search",
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      project: { type: "string" },
      path: { type: "string" },
      query: { type: "string" },
      case_sensitive: { type: "boolean" },
      scanned_files: { type: "integer" },
      scanned_directories: { type: "integer" },
      skipped_binary: { type: "integer" },
      skipped_large: { type: "integer" },
      skipped_links: { type: "integer" },
      count: { type: "integer" },
      truncated: { type: "boolean" },
      matches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string" },
            line: { type: "integer" },
            column: { type: "integer" },
            preview: { type: "string" },
          },
          required: ["path", "line", "column", "preview"],
          additionalProperties: false,
        },
      },
    },
    required: [
      "ok",
      "project",
      "path",
      "query",
      "case_sensitive",
      "scanned_files",
      "scanned_directories",
      "skipped_binary",
      "skipped_large",
      "skipped_links",
      "count",
      "truncated",
      "matches",
    ],
    additionalProperties: false,
  },
}

const SCRIPTING_EDIT_TOOL = {
  description:
    "Prepare an exact text edit inside one existing UTF-8 file. The old_text match count must equal expected_occurrences. This tool does not write; it returns a standard replace preview for scripting_change_apply.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", minLength: 1 },
      path: { type: "string", minLength: 1 },
      old_text: { type: "string", minLength: 1 },
      new_text: { type: "string" },
      expected_occurrences: { type: "integer", minimum: 1, maximum: 100 },
    },
    required: ["project", "path", "old_text", "new_text"],
    additionalProperties: false,
  },
  name: "scripting_edit",
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      preview_id: { type: "string" },
      operation: { type: "string" },
      project: { type: "string" },
      path: { type: "string" },
      match_count: { type: "integer" },
      old_size_bytes: { type: "integer" },
      new_size_bytes: { type: "integer" },
      expires_at: { type: "string" },
      summary: { type: "string" },
    },
    required: [
      "ok",
      "preview_id",
      "operation",
      "project",
      "path",
      "match_count",
      "old_size_bytes",
      "new_size_bytes",
      "expires_at",
      "summary",
    ],
    additionalProperties: false,
  },
}

const SCRIPTING_RUN_TOOL = {
  description:
    "Run another Scripting project with the native Script.run API and wait for Script.exit(result). Defaults to single_mode=true. ScriptingPlus and the rescue bridge cannot be run through this tool.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", minLength: 1 },
      query_parameters: {
        type: "object",
        additionalProperties: { type: "string" },
      },
      single_mode: { type: "boolean" },
    },
    required: ["project"],
    additionalProperties: false,
  },
  name: "scripting_run",
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      project: { type: "string" },
      single_mode: { type: "boolean" },
      result_type: { type: "string" },
      result_json: { type: "string" },
      result_size_bytes: { type: "integer" },
    },
    required: [
      "ok",
      "project",
      "single_mode",
      "result_type",
      "result_json",
      "result_size_bytes",
    ],
    additionalProperties: false,
  },
}

const PROJECT_PREVIEW_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    preview_id: { type: "string" },
    operation: { type: "string" },
    project: { type: "string" },
    source_project: { type: "string" },
    entry_count: { type: "integer" },
    total_size_bytes: { type: "integer" },
    expires_at: { type: "string" },
    summary: { type: "string" },
  },
  required: [
    "ok", "preview_id", "operation", "project", "source_project",
    "entry_count", "total_size_bytes", "expires_at", "summary",
  ],
  additionalProperties: false,
}

const SCRIPTING_PROJECT_CREATE_PREVIEW_TOOL = {
  description:
    "Preview creation of a new top-level Scripting project with a minimal index.tsx, script.json, and README.md. Apply with scripting_change_apply.",
  inputSchema: {
    type: "object",
    properties: { project: { type: "string", minLength: 1 } },
    required: ["project"],
    additionalProperties: false,
  },
  name: "scripting_project_create_preview",
  outputSchema: PROJECT_PREVIEW_OUTPUT_SCHEMA,
}

const SCRIPTING_PROJECT_CLONE_PREVIEW_TOOL = {
  description:
    "Preview cloning one complete Scripting project to a new top-level project. The source is snapshotted and revalidated before apply; symbolic links are rejected.",
  inputSchema: {
    type: "object",
    properties: {
      source_project: { type: "string", minLength: 1 },
      project: { type: "string", minLength: 1 },
    },
    required: ["source_project", "project"],
    additionalProperties: false,
  },
  name: "scripting_project_clone_preview",
  outputSchema: PROJECT_PREVIEW_OUTPUT_SCHEMA,
}

const SCRIPTING_PROJECT_DELETE_PREVIEW_TOOL = {
  description:
    "Preview recursive deletion of one complete Scripting project. Requires confirm_project to exactly match project, snapshots the full project, and refuses deletion of MCP control projects.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", minLength: 1 },
      confirm_project: { type: "string", minLength: 1 },
    },
    required: ["project", "confirm_project"],
    additionalProperties: false,
  },
  name: "scripting_project_delete_preview",
  outputSchema: PROJECT_PREVIEW_OUTPUT_SCHEMA,
}

const SCRIPTING_VALIDATE_TOOL = {
  description:
    "Validate one Scripting project structure and manifest, detect symbolic links, check entrypoints, and conservatively check literal relative imports. Read-only.",
  inputSchema: {
    type: "object",
    properties: { project: { type: "string", minLength: 1 } },
    required: ["project"],
    additionalProperties: false,
  },
  name: "scripting_validate",
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      project: { type: "string" },
      valid: { type: "boolean" },
      error_count: { type: "integer" },
      warning_count: { type: "integer" },
      file_count: { type: "integer" },
      directory_count: { type: "integer" },
      total_size_bytes: { type: "integer" },
      entrypoints: { type: "array", items: { type: "string" } },
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            severity: { type: "string", enum: ["error", "warning"] },
            code: { type: "string" },
            path: { type: "string" },
            line: { type: "integer" },
            message: { type: "string" },
          },
          required: ["severity", "code", "path", "line", "message"],
          additionalProperties: false,
        },
      },
    },
    required: [
      "ok", "project", "valid", "error_count", "warning_count", "file_count",
      "directory_count", "total_size_bytes", "entrypoints", "issues",
    ],
    additionalProperties: false,
  },
}

const SCRIPTING_HASH_TOOL = {
  description:
    "Return a deterministic SHA-256 for one file or directory inside a Scripting project. Directory hashes cover sorted paths, file sizes, file contents, and empty directories; symbolic links are rejected.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", minLength: 1 },
      path: { type: "string" },
    },
    required: ["project"],
    additionalProperties: false,
  },
  name: "scripting_hash",
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      project: { type: "string" },
      path: { type: "string" },
      type: { type: "string", enum: ["file", "directory"] },
      algorithm: { type: "string", enum: ["sha256"] },
      sha256: { type: "string" },
      size_bytes: { type: "integer" },
      file_count: { type: "integer" },
      entry_count: { type: "integer" },
    },
    required: ["ok", "project", "path", "type", "algorithm", "sha256", "size_bytes", "file_count", "entry_count"],
    additionalProperties: false,
  },
}

const SCRIPTING_CHANGE_PREVIEW_TOOL = {
  description:
    "Preview one controlled filesystem mutation inside an existing Scripting project. Supports create, replace, create_directory, delete, move, or copy_file. This tool never mutates files; apply the returned preview_id with scripting_change_apply.",
  inputSchema: {
    type: "object",
    properties: {
      operation: { type: "string", enum: ["create", "replace", "create_directory", "delete", "move", "copy_file"] },
      project: { type: "string", minLength: 1 },
      path: { type: "string", minLength: 1 },
      destination_path: { type: "string", minLength: 1 },
      content: { type: "string" },
    },
    required: ["operation", "project", "path"],
    additionalProperties: false,
  },
  name: "scripting_change_preview",
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      preview_id: { type: "string" },
      operation: { type: "string" },
      project: { type: "string" },
      path: { type: "string" },
      destination_path: { type: "string" },
      target_exists: { type: "boolean" },
      target_kind: { type: "string" },
      old_size_bytes: { type: "integer" },
      new_size_bytes: { type: "integer" },
      expires_at: { type: "string" },
      summary: { type: "string" },
    },
    required: [
      "ok",
      "preview_id",
      "operation",
      "project",
      "path",
      "destination_path",
      "target_exists",
      "target_kind",
      "old_size_bytes",
      "new_size_bytes",
      "expires_at",
      "summary",
    ],
    additionalProperties: false,
  },
}

const SCRIPTING_MOVE_PREVIEW_TOOL = {
  description:
    "Preview moving or renaming one file or directory inside an existing Scripting project. This tool never mutates files; apply the returned preview_id with scripting_change_apply.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", minLength: 1 },
      path: { type: "string", minLength: 1 },
      destination_path: { type: "string", minLength: 1 },
    },
    required: ["project", "path", "destination_path"],
    additionalProperties: false,
  },
  name: "scripting_move_preview",
  outputSchema: SCRIPTING_CHANGE_PREVIEW_TOOL.outputSchema,
}

const SCRIPTING_COPY_FILE_PREVIEW_TOOL = {
  description:
    "Preview copying one regular file inside an existing Scripting project. This tool never mutates files; apply the returned preview_id with scripting_change_apply.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", minLength: 1 },
      path: { type: "string", minLength: 1 },
      destination_path: { type: "string", minLength: 1 },
    },
    required: ["project", "path", "destination_path"],
    additionalProperties: false,
  },
  name: "scripting_copy_file_preview",
  outputSchema: SCRIPTING_CHANGE_PREVIEW_TOOL.outputSchema,
}

const SCRIPTING_ZIP_PREVIEW_TOOL = {
  description:
    "Preview creation of a ZIP archive from one file or directory inside an existing Scripting project. Source content is snapshotted and revalidated before apply.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", minLength: 1 },
      path: { type: "string", minLength: 1 },
      destination_path: { type: "string", minLength: 1 },
      keep_parent: { type: "boolean" },
    },
    required: ["project", "path", "destination_path"],
    additionalProperties: false,
  },
  name: "scripting_zip_preview",
  outputSchema: SCRIPTING_CHANGE_PREVIEW_TOOL.outputSchema,
}

const SCRIPTING_UNZIP_PREVIEW_TOOL = {
  description:
    "Preview extraction of one validated ZIP archive into a new directory inside an existing Scripting project. Archive paths, entry count, size, encryption, ZIP64, and symbolic-link metadata are checked before apply.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", minLength: 1 },
      path: { type: "string", minLength: 1 },
      destination_path: { type: "string", minLength: 1 },
    },
    required: ["project", "path", "destination_path"],
    additionalProperties: false,
  },
  name: "scripting_unzip_preview",
  outputSchema: SCRIPTING_CHANGE_PREVIEW_TOOL.outputSchema,
}

const SCRIPTING_COMPRESSED_REPLACE_PREVIEW_TOOL = {
  description:
    "Decode a Base64 ZIP containing exactly one regular UTF-8 file named payload, verify the archive, and prepare a normal replace preview for an existing text file. The archive itself is never persisted in the project.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", minLength: 1 },
      path: { type: "string", minLength: 1 },
      archive_base64: { type: "string", minLength: 1 },
      archive_sha256: { type: "string", minLength: 64, maxLength: 64 },
    },
    required: ["project", "path", "archive_base64"],
    additionalProperties: false,
  },
  name: "scripting_compressed_replace_preview",
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      preview_id: { type: "string" },
      operation: { type: "string" },
      project: { type: "string" },
      path: { type: "string" },
      match_count: { type: "integer" },
      old_size_bytes: { type: "integer" },
      new_size_bytes: { type: "integer" },
      compressed_size_bytes: { type: "integer" },
      uncompressed_size_bytes: { type: "integer" },
      archive_sha256: { type: "string" },
      compression_ratio: { type: "number" },
      expires_at: { type: "string" },
      summary: { type: "string" },
    },
    required: [
      "ok", "preview_id", "operation", "project", "path", "match_count",
      "old_size_bytes", "new_size_bytes", "compressed_size_bytes",
      "uncompressed_size_bytes", "archive_sha256", "compression_ratio",
      "expires_at", "summary",
    ],
    additionalProperties: false,
  },
}

const SCRIPTING_CHANGE_APPLY_TOOL = {
  description:
    "Apply one unexpired scripting_change_preview. Revalidates source/destination path and symlink boundaries, refuses stale previews, never recursively deletes directories, and consumes the preview exactly once.",
  inputSchema: {
    type: "object",
    properties: {
      preview_id: { type: "string", minLength: 1 },
    },
    required: ["preview_id"],
    additionalProperties: false,
  },
  name: "scripting_change_apply",
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      preview_id: { type: "string" },
      operation: { type: "string" },
      project: { type: "string" },
      path: { type: "string" },
      size_bytes: { type: "integer" },
      created: { type: "boolean" },
      replaced: { type: "boolean" },
      directory_created: { type: "boolean" },
      deleted: { type: "boolean" },
      moved: { type: "boolean" },
      copied: { type: "boolean" },
      destination_path: { type: "string" },
    },
    required: [
      "ok",
      "preview_id",
      "operation",
      "project",
      "path",
      "size_bytes",
      "created",
      "replaced",
      "directory_created",
      "deleted",
      "moved",
      "copied",
      "destination_path",
    ],
    additionalProperties: false,
  },
}

type JsonRpcId = string | number

type JsonRpcMessage = {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: Record<string, any>
  [key: string]: any
}

type TunnelCommand = {
  request_id: string
  shard_token: string
  command_type: string
  channel?: string
  created_at?: string
  response_timeout?: unknown
  headers?: Record<string, string[]>
  jsonrpc?: JsonRpcMessage
  [key: string]: any
}

type PollEnvelope = {
  commands?: TunnelCommand[]
}

type GitHubQueuedFilePreview = {
  localPath: string
  remotePath: string
  bytes: Uint8Array
  expectedRemoteSha: string | null
  expectedRemoteExists: boolean
  gitBlobSha: string
  sizeBytes: number
  needsWrite: boolean
}

type ChangeOperation =
  | "create"
  | "replace"
  | "create_directory"
  | "delete"
  | "move"
  | "copy_file"
  | "zip"
  | "unzip"
  | "create_project"
  | "clone_project"
  | "delete_project"
  // Legacy single-file GitHub apply branch remains unreachable; kept only for compile compatibility.
  | "github_put"
  | "github_delete"
  | "github_queue"
  | "project_deploy"
  // Legacy binary-resource preview implementation is intentionally unreachable in 1.4.
  | "resource_write"

type ChangeTargetKind = "missing" | "file" | "directory"

type ZipEntryInfo = {
  relativePath: string
  isDirectory: boolean
  uncompressedSize: number
}

type PathSnapshotEntry = {
  relativePath: string
  kind: "file" | "directory"
  bytes: Uint8Array | null
}

type ProjectSeedFile = {
  relativePath: string
  content: string
}

type ValidationIssue = {
  severity: "error" | "warning"
  code: string
  path: string
  line: number
  message: string
}

type PendingChangePreview = {
  previewId: string
  operation: ChangeOperation
  project: string
  relativePath: string
  destinationPath: string | null
  content: string | null
  expectedOriginal: string | null
  expectedDeleteBytes: Uint8Array | null
  expectedPathSnapshot: PathSnapshotEntry[] | null
  targetKind: ChangeTargetKind
  oldSizeBytes: number
  newSizeBytes: number
  createdAt: number
  expiresAt: number
  sourceProject?: string | null
  projectSeedFiles?: ProjectSeedFile[] | null
  archiveKeepParent?: boolean
  archiveEntries?: ZipEntryInfo[] | null
  archiveUncompressedBytes?: number
  githubOwner?: string
  githubRepo?: string
  githubBranch?: string
  githubMessage?: string
  githubQueuedFiles?: GitHubQueuedFilePreview[] | null
  binaryContent?: Uint8Array | null
  restoreEntries?: PathSnapshotEntry[] | null
}

type StatusSetter = (value: string) => void
type LogSetter = (value: string) => void

let running = false
let starting = false
let stopRequested = false
let inFlightCommandCount = 0
const MAX_INFLIGHT_COMMANDS = 8
const commandQueue: Array<{
  config: { tunnelId: string; apiKey: string }
  command: TunnelCommand
  receiptMs: number | null
  controlPlaneRequestID: string | null
}> = []
let activeControlRequestController: AbortController | null = null
const MAX_LOG_LINES = 300
const DISPLAY_LOG_LINES = 60
let logLines: string[] = []
let logSink: LogSetter | null = null
let debugLoggingEnabled = false
let backgroundKeepAliveRequested = false
let backgroundKeepAliveStarting = false
let backgroundKeepAliveDesired = false
let scenePhaseListenerInstalled = false
const pendingChangePreviews = new Map<string, PendingChangePreview>()

type ScenePhase = "active" | "inactive" | "background"

async function requestBackgroundKeepAlive(): Promise<void> {
  backgroundKeepAliveDesired = true
  if (backgroundKeepAliveRequested || backgroundKeepAliveStarting) return
  if (!running && !starting) {
    backgroundKeepAliveDesired = false
    return
  }

  if (Script.env !== "index") {
    backgroundKeepAliveDesired = false
    log(`后台保活不可用：Script.env=${Script.env}`)
    return
  }

  backgroundKeepAliveStarting = true
  try {
    const started = await BackgroundKeeper.keepAlive()
    if (!started) {
      backgroundKeepAliveDesired = false
      log("BackgroundKeeper.keepAlive() 被系统拒绝")
      return
    }

    backgroundKeepAliveRequested = true
  } catch (error) {
    backgroundKeepAliveDesired = false
    log(`BackgroundKeeper 启动失败：${safeError(error)}`)
  } finally {
    backgroundKeepAliveStarting = false
  }

  // The app can return active, or the Tunnel can stop, while keepAlive() is
  // awaiting. In that race, release immediately after the request succeeds.
  if (backgroundKeepAliveRequested && (!backgroundKeepAliveDesired || (!running && !starting))) {
    await releaseBackgroundKeepAlive()
  }
}

async function releaseBackgroundKeepAlive(): Promise<void> {
  backgroundKeepAliveDesired = false
  if (!backgroundKeepAliveRequested) return

  // Clear our local ownership flag first so repeated active/stop events do not
  // release the same queue entry more than once.
  backgroundKeepAliveRequested = false
  try {
    await BackgroundKeeper.stopKeepAlive()
  } catch (error) {
    log(`BackgroundKeeper 释放失败：${safeError(error)}`)
  }
}

function handleScenePhase(phase: ScenePhase): void {
  if (phase === "background") {
    void requestBackgroundKeepAlive()
    return
  }

  if (phase === "active") {
    backgroundKeepAliveDesired = false
    void releaseBackgroundKeepAlive()
  }
}

function installScenePhaseListener(): void {
  if (scenePhaseListenerInstalled) return
  AppEvents.scenePhase.addListener(handleScenePhase)
  scenePhaseListenerInstalled = true
}

function removeScenePhaseListener(): void {
  if (!scenePhaseListenerInstalled) return
  AppEvents.scenePhase.removeListener(handleScenePhase)
  scenePhaseListenerInstalled = false
}

function nowTime(): string {
  return new Date().toLocaleTimeString()
}

function log(message: string): void {
  if (!debugLoggingEnabled) return
  const line = `[${nowTime()}] ${message}`
  console.log(line)
  logLines.push(line)
  if (logLines.length > MAX_LOG_LINES) {
    logLines.splice(0, logLines.length - MAX_LOG_LINES)
  }
  logSink?.(logLines.slice(-DISPLAY_LOG_LINES).join("\n"))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function beginControlRequest(): AbortController {
  const controller = new AbortController()
  activeControlRequestController = controller
  return controller
}

function finishControlRequest(controller: AbortController): void {
  if (activeControlRequestController === controller) {
    activeControlRequestController = null
  }
}

function abortControlRequest(): void {
  const controller = activeControlRequestController
  activeControlRequestController = null
  if (controller && !controller.signal.aborted) {
    controller.abort("Tunnel stopped")
  }
}

// OpenAI defines X-Tunnel-Client-Instance-Id as process-scoped:
// generate a new opaque ID for each script runtime, then keep it stable
// for every metadata / poll / response request in that runtime.
const CLIENT_INSTANCE_ID = `scripting-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

type TunnelRuntimeLease = {
  instance_id: string
  state: "starting" | "online" | "stopping"
  desired: boolean
  heartbeat_ms: number
}

let runtimeHeartbeatGeneration = 0
let runtimeHeartbeatRunning = false
let runtimeStatus = "idle"
let runtimeStatusSink: StatusSetter | null = null

function setRuntimeStatus(value: string): void {
  runtimeStatus = value
  runtimeStatusSink?.(value)
}

function readRuntimeLease(): TunnelRuntimeLease | null {
  const value = Storage.get<any>(STORAGE_TUNNEL_RUNTIME)
  if (!isPlainObject(value)) return null
  const instanceId = typeof value.instance_id === "string" ? value.instance_id : ""
  const state = value.state
  const desired = value.desired
  const heartbeatMs = value.heartbeat_ms
  if (
    !instanceId ||
    (state !== "starting" && state !== "online" && state !== "stopping") ||
    typeof desired !== "boolean" ||
    typeof heartbeatMs !== "number" ||
    !Number.isFinite(heartbeatMs)
  ) {
    return null
  }
  return { instance_id: instanceId, state, desired, heartbeat_ms: heartbeatMs }
}

function runtimeLeaseIsLive(lease: TunnelRuntimeLease | null, now = Date.now()): boolean {
  return !!lease && now - lease.heartbeat_ms <= TUNNEL_RUNTIME_STALE_MS
}

function writeOwnedRuntimeLease(state: TunnelRuntimeLease["state"], desired: boolean): void {
  Storage.set(STORAGE_TUNNEL_RUNTIME, {
    instance_id: CLIENT_INSTANCE_ID,
    state,
    desired,
    heartbeat_ms: Date.now(),
  })
}

function clearOwnedRuntimeLease(): void {
  const lease = readRuntimeLease()
  if (lease?.instance_id === CLIENT_INSTANCE_ID) Storage.remove(STORAGE_TUNNEL_RUNTIME)
}

function liveForeignRuntimeLease(): TunnelRuntimeLease | null {
  const lease = readRuntimeLease()
  if (!runtimeLeaseIsLive(lease) || lease?.instance_id === CLIENT_INSTANCE_ID) return null
  return lease
}

function requestForeignRuntimeStop(): boolean {
  const lease = liveForeignRuntimeLease()
  if (!lease) return false
  Storage.set(STORAGE_TUNNEL_RUNTIME, {
    ...lease,
    state: "stopping",
    desired: false,
    heartbeat_ms: lease.heartbeat_ms,
  })
  return true
}

function stopRuntimeHeartbeat(): void {
  runtimeHeartbeatGeneration += 1
  runtimeHeartbeatRunning = false
}

function startRuntimeHeartbeat(): void {
  if (runtimeHeartbeatRunning) return
  runtimeHeartbeatRunning = true
  const generation = ++runtimeHeartbeatGeneration

  void (async () => {
    try {
      while (runtimeHeartbeatRunning && generation === runtimeHeartbeatGeneration) {
        await sleep(TUNNEL_RUNTIME_HEARTBEAT_MS)
        if (!runtimeHeartbeatRunning || generation !== runtimeHeartbeatGeneration) break

        const lease = readRuntimeLease()
        if (!lease || lease.instance_id !== CLIENT_INSTANCE_ID) {
          if (running || starting) stopTunnel()
          break
        }
        if (!lease.desired) {
          stopTunnel()
          break
        }

        const state: TunnelRuntimeLease["state"] = stopRequested
          ? "stopping"
          : running
            ? "online"
            : "starting"
        writeOwnedRuntimeLease(state, true)
      }
    } finally {
      if (generation === runtimeHeartbeatGeneration) {
        runtimeHeartbeatRunning = false
      }
    }
  })()
}

function releaseRuntimeOwnership(): void {
  stopRuntimeHeartbeat()
  clearOwnedRuntimeLease()
  commandQueue.length = 0
  backgroundKeepAliveDesired = false
  void releaseBackgroundKeepAlive()
}

type RoutingState = {
  token: string
  revision: number
  known: boolean
  acceptedToken: string
  failures: number
  corrections: number
}

const routingState: RoutingState = {
  token: "",
  revision: 0,
  known: false,
  acceptedToken: "",
  failures: 0,
  corrections: 0,
}

function readConfig(): { tunnelId: string; apiKey: string } | null {
  const tunnelId = (Storage.get<string>(STORAGE_TUNNEL_ID) ?? "").trim()
  const apiKey = (Keychain.get(KEYCHAIN_API_KEY) ?? "").trim()
  if (!tunnelId || !apiKey) return null
  return { tunnelId, apiKey }
}

function saveConfig(tunnelId: string, apiKeyInput: string): boolean {
  const normalizedTunnelId = tunnelId.trim()
  if (!normalizedTunnelId) {
    log("Tunnel ID 为空，未保存")
    return false
  }

  Storage.set(STORAGE_TUNNEL_ID, normalizedTunnelId)

  const normalizedApiKey = apiKeyInput.trim()
  if (normalizedApiKey) {
    const ok = Keychain.set(KEYCHAIN_API_KEY, normalizedApiKey, {
      accessibility: "first_unlock_this_device",
    })
    if (!ok) {
      log("Runtime API Key 写入 Keychain 失败")
      return false
    }
  }

  if (!Keychain.contains(KEYCHAIN_API_KEY)) {
    log("Runtime API Key 尚未保存")
    return false
  }

  return true
}

function hasMonotonicClock(): boolean {
  const value = monotonicNowMs()
  return value !== null
}

function commonHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": USER_AGENT,
    "X-Tunnel-Client-Name": CLIENT_NAME,
    "X-Tunnel-Client-Version": VERSION,
    "X-Tunnel-Client-Instance-Id": CLIENT_INSTANCE_ID,
    "X-Tunnel-Client-Capabilities": CLIENT_CAPABILITIES,
    "X-Tunnel-MCP-Server-Info": MCP_SERVER_INFO,
  }

  // The current Tunnel wire contract requires response_timeout to be anchored to
  // a monotonic receipt clock. Only advertise it when this runtime provides one.
  if (hasMonotonicClock()) {
    headers["X-Tunnel-Client-Wire-Protocol-Version"] = TUNNEL_WIRE_VERSION
  }

  return headers
}

async function verifyTunnelAccess(setStatus: StatusSetter): Promise<boolean> {
  const config = readConfig()
  if (!config) {
    setStatus("missing_config")
    log("缺少 Tunnel ID 或 Runtime API Key")
    return false
  }

  setStatus("connecting")
  const controller = beginControlRequest()

  try {
    const response = await fetch(
      `${API_BASE}/v1/tunnels/${encodeURIComponent(config.tunnelId)}`,
      {
        method: "GET",
        headers: commonHeaders(config.apiKey),
        timeout: 15,
        signal: controller.signal as any,
        debugLabel: "Tunnel metadata",
      },
    )

    if (response.status === 200) {
      setStatus("authenticated")
      log("Tunnel 认证成功")
      if (!hasMonotonicClock()) log("警告：performance.now() 不可用，未声明当前 Tunnel wire version")
      return true
    }

    if (response.status === 401 || response.status === 403) {
      setStatus("auth_failed")
      log(`Tunnel 认证失败：HTTP ${response.status}`)
      return false
    }

    setStatus(`metadata_${response.status}`)
    log(`Tunnel metadata：HTTP ${response.status}`)
    return false
  } catch (error) {
    if (stopRequested || controller.signal.aborted) return false
    setStatus("network_error")
    log(`Tunnel metadata 网络错误：${safeError(error)}`)
    return false
  } finally {
    finishControlRequest(controller)
  }
}

function safeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-[redacted]")
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function headerValues(
  headers: Record<string, string[]> | undefined,
  name: string,
): string[] {
  if (!headers) return []
  const target = name.toLowerCase()
  for (const [key, values] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue
    return Array.isArray(values) ? values.filter(value => typeof value === "string") : []
  }
  return []
}

function singleHeader(
  headers: Record<string, string[]> | undefined,
  name: string,
): string | null {
  const values = headerValues(headers, name)
  return values.length === 1 ? values[0] : null
}

function requestMeta(message: JsonRpcMessage): Record<string, any> | null {
  const params = message.params
  if (!isPlainObject(params)) return null
  return isPlainObject(params._meta) ? params._meta : null
}

function bodyProtocolVersion(message: JsonRpcMessage): string | null {
  const value = requestMeta(message)?.["io.modelcontextprotocol/protocolVersion"]
  return typeof value === "string" ? value : null
}

function isModernCandidate(
  message: JsonRpcMessage,
  headers: Record<string, string[]> | undefined,
): boolean {
  if (message.method === "server/discover") return true
  if (bodyProtocolVersion(message) !== null) return true
  const headerVersion = singleHeader(headers, "MCP-Protocol-Version")
  return typeof headerVersion === "string" && headerVersion >= MCP_MODERN_VERSION
}

function serverInfoMeta(): Record<string, any> {
  return {
    "io.modelcontextprotocol/serverInfo": {
      name: CLIENT_NAME,
      version: VERSION,
      description: "Scripting iPhone Secure MCP bridge",
    },
  }
}

function modernCompleteResult(payload: Record<string, any>): Record<string, any> {
  return {
    resultType: "complete",
    ...payload,
    _meta: serverInfoMeta(),
  }
}

function chooseLegacyVersion(message: JsonRpcMessage): string {
  const requested = message?.params?.protocolVersion
  if (typeof requested === "string" && MCP_LEGACY_VERSIONS.includes(requested)) {
    return requested
  }
  return MCP_LEGACY_VERSIONS[0]
}

function validJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value))
}

function requestId(message: JsonRpcMessage): JsonRpcId | undefined {
  if (!Object.prototype.hasOwnProperty.call(message, "id")) return undefined
  return validJsonRpcId(message.id) ? message.id : undefined
}

function jsonRpcResult(id: JsonRpcId, result: Record<string, any>): JsonRpcMessage {
  return { jsonrpc: "2.0", id, result }
}

function jsonRpcError(
  id: JsonRpcId | undefined,
  code: number,
  message: string,
  data?: Record<string, any>,
): JsonRpcMessage {
  return {
    jsonrpc: "2.0",
    ...(id !== undefined ? { id } : {}),
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  }
}

type DispatchResult = {
  kind: "response" | "ack"
  code: number
  modern: boolean
  json?: JsonRpcMessage
}

function validateModernRequest(
  message: JsonRpcMessage,
  headers: Record<string, string[]> | undefined,
): DispatchResult | null {
  const id = requestId(message)
  const params = message.params
  const meta = requestMeta(message)
  const version = bodyProtocolVersion(message)
  const capabilities = meta?.["io.modelcontextprotocol/clientCapabilities"]

  if (!isPlainObject(params) || !meta || !version || !isPlainObject(capabilities)) {
    return {
      kind: "response",
      code: 400,
      modern: true,
      json: jsonRpcError(
        id,
        -32602,
        "Invalid params: request _meta must include protocolVersion and clientCapabilities",
      ),
    }
  }

  const versionHeaders = headerValues(headers, "MCP-Protocol-Version")
  const methodHeaders = headerValues(headers, "Mcp-Method")
  if (
    versionHeaders.length !== 1 ||
    methodHeaders.length !== 1 ||
    versionHeaders[0] !== version ||
    methodHeaders[0] !== message.method
  ) {
    return {
      kind: "response",
      code: 400,
      modern: true,
      json: jsonRpcError(
        id,
        -32020,
        "HTTP MCP headers are missing, duplicated, or do not match the request body",
      ),
    }
  }

  if (version !== MCP_MODERN_VERSION) {
    return {
      kind: "response",
      code: 400,
      modern: true,
      json: jsonRpcError(id, -32022, "Unsupported protocol version", {
        supported: [MCP_MODERN_VERSION],
        requested: version,
      }),
    }
  }

  if (message.method === "tools/call") {
    const toolName = isPlainObject(params) && typeof params.name === "string" ? params.name : ""
    const nameHeaders = headerValues(headers, "Mcp-Name")
    if (!toolName || nameHeaders.length !== 1 || nameHeaders[0] !== toolName) {
      return {
        kind: "response",
        code: 400,
        modern: true,
        json: jsonRpcError(
          id,
          -32020,
          'missing, duplicated, or mismatched Mcp-Name header for method "tools/call"',
        ),
      }
    }
  }

  return null
}

function scriptingStatusPayload(): Record<string, any> {
  return {
    ok: true,
    version: VERSION,
    environment: Script.env,
    tunnel: running ? "online" : "stopped",
    wire_protocol: TUNNEL_WIRE_VERSION,
    background_keep_alive: backgroundKeepAliveRequested,
  }
}

function toolCallResult(payload: Record<string, any>, modern: boolean): Record<string, any> {
  const base = {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  }
  return modern
    ? { ...base, resultType: "complete", _meta: serverInfoMeta() }
    : base
}

function toolErrorResult(message: string, modern: boolean): Record<string, any> {
  const base = {
    content: [{ type: "text", text: message }],
    isError: true,
  }
  return modern
    ? { ...base, resultType: "complete", _meta: serverInfoMeta() }
    : base
}

function normalizedRoot(): string {
  const root = Path.normalize(FileManager.scriptsDirectory)
  return root.endsWith("/") && root.length > 1 ? root.slice(0, -1) : root
}

function pathInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}/`)
}

function validateProjectName(project: string): string | null {
  if (!project || project.includes("\0") || project.includes("/") || project.includes("\\")) {
    return "project must be one top-level Scripting project name"
  }
  if (project === "." || project === ".." || Path.isAbsolute(project)) {
    return "project must be a relative top-level Scripting project name"
  }
  return null
}

function validateRelativeFilePath(path: string): string | null {
  if (!path || path.includes("\0") || path.includes("\\") || Path.isAbsolute(path)) {
    return "path must be a relative project file path"
  }
  const segments = path.split("/")
  if (segments.some(segment => !segment || segment === "." || segment === "..")) {
    return "path contains an empty, dot, or parent segment"
  }
  return null
}

async function rejectLinksOnPath(root: string, target: string): Promise<string | null> {
  if (!pathInside(root, target)) return "path escapes scriptsDirectory"
  if (target === root) return null
  const relative = target.slice(root.length + 1)
  const segments = relative.split("/")
  let current = root
  for (const segment of segments) {
    current = Path.join(current, segment)
    if (!(await FileManager.exists(current))) return `path does not exist: ${segment}`
    if (await FileManager.isLink(current)) return `symbolic links are not allowed: ${segment}`
  }
  return null
}

async function readStrictUtf8File(
  target: string,
  maxBytes: number,
  label: string,
): Promise<{ text: string; sizeBytes: number }> {
  const stat = await FileManager.stat(target)
  if (stat.size > maxBytes) {
    throw new Error(`${label} exceeds ${maxBytes} byte limit`)
  }

  const data = Data.fromFile(target)
  if (!data) throw new Error(`${label} could not be read`)
  const bytes = data.toUint8Array()
  if (!bytes) throw new Error(`${label} could not be decoded`)

  for (const byte of bytes) {
    if (
      byte === 0 ||
      byte === 0x7f ||
      byte < 0x09 ||
      (byte > 0x0d && byte < 0x20)
    ) {
      throw new Error(`${label} is not a UTF-8 text file`)
    }
  }

  const text = data.toRawString("utf-8")
  if (text === null) throw new Error(`${label} is not valid UTF-8 text`)
  return { text, sizeBytes: bytes.byteLength }
}

function sha256Data(data: any): string {
  return Crypto.sha256(data).toHexString()
}

async function fileSha256(path: string): Promise<string> {
  const bytes = await FileManager.readAsBytes(path)
  return sha256Bytes(bytes)
}

async function scriptingProjectsPayload(): Promise<Record<string, any>> {
  const root = normalizedRoot()
  const entries = await FileManager.readDirectory(root, false)
  const projects: Array<Record<string, any>> = []
  const entryCandidates = ["index.tsx", "index.ts", "index.js", "index.py", "widget.tsx", "intent.tsx"]

  for (const entry of entries) {
    const candidate = Path.normalize(Path.isAbsolute(entry) ? entry : Path.join(root, entry))
    if (!pathInside(root, candidate) || Path.dirname(candidate) !== root) continue
    if (!(await FileManager.exists(candidate))) continue
    if (await FileManager.isLink(candidate)) continue
    if (!(await FileManager.isDirectory(candidate))) continue

    const name = Path.basename(candidate)
    const entrypoints: string[] = []
    for (const fileName of entryCandidates) {
      const file = Path.join(candidate, fileName)
      if ((await FileManager.exists(file)) && !(await FileManager.isLink(file)) && (await FileManager.isFile(file))) {
        entrypoints.push(fileName)
      }
    }
    const manifest = Path.join(candidate, "script.json")
    const hasManifest =
      (await FileManager.exists(manifest)) &&
      !(await FileManager.isLink(manifest)) &&
      (await FileManager.isFile(manifest))

    projects.push({ name, entrypoints, has_manifest: hasManifest })
  }

  projects.sort((a, b) => String(a.name).localeCompare(String(b.name)))
  return { ok: true, count: projects.length, projects }
}

async function scriptingReadPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const project = typeof args.project === "string" ? args.project : ""
  const relativePath = typeof args.path === "string" ? args.path : ""
  const projectError = validateProjectName(project)
  if (projectError) throw new Error(projectError)
  const pathError = validateRelativeFilePath(relativePath)
  if (pathError) throw new Error(pathError)

  const startLine = args.start_line === undefined ? 1 : args.start_line
  const maxLines = args.max_lines === undefined ? 200 : args.max_lines
  if (!Number.isInteger(startLine) || startLine < 1) throw new Error("start_line must be an integer >= 1")
  if (!Number.isInteger(maxLines) || maxLines < 1 || maxLines > 500) {
    throw new Error("max_lines must be an integer between 1 and 500")
  }

  const root = normalizedRoot()
  const projectPath = Path.normalize(Path.join(root, project))
  if (!pathInside(root, projectPath) || Path.dirname(projectPath) !== root) {
    throw new Error("project escapes scriptsDirectory")
  }
  const projectLinkError = await rejectLinksOnPath(root, projectPath)
  if (projectLinkError) throw new Error(projectLinkError)
  if (!(await FileManager.isDirectory(projectPath))) throw new Error("project is not a directory")

  const target = Path.normalize(Path.join(projectPath, relativePath))
  if (!pathInside(projectPath, target)) throw new Error("path escapes project directory")
  const targetLinkError = await rejectLinksOnPath(projectPath, target)
  if (targetLinkError) throw new Error(targetLinkError)
  if (!(await FileManager.isFile(target))) throw new Error("path is not a file")
  const utf8 = await readStrictUtf8File(target, MAX_READ_FILE_BYTES, "file")
  const text = utf8.text
  const lines = text.split(/\r?\n/)
  const totalLines = lines.length
  const startIndex = Math.min(startLine - 1, totalLines)
  const selected = lines.slice(startIndex, startIndex + maxLines)
  const actualStart = startIndex < totalLines ? startIndex + 1 : totalLines + 1
  const actualEnd = selected.length > 0 ? startIndex + selected.length : startIndex

  return {
    ok: true,
    project,
    path: relativePath,
    content: selected.join("\n"),
    start_line: actualStart,
    end_line: actualEnd,
    total_lines: totalLines,
    truncated: actualEnd < totalLines,
    size_bytes: utf8.sizeBytes,
  }
}


function optionalRelativePath(value: unknown): string {
  if (value === undefined) return ""
  if (typeof value !== "string") throw new Error("path must be a string")
  if (!value) return ""
  const error = validateRelativeFilePath(value)
  if (error) throw new Error(error)
  return value
}

function integerOption(
  value: unknown,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`)
  }
  return value as number
}

function projectRelativePath(projectPath: string, absolutePath: string): string {
  if (absolutePath === projectPath) return ""
  if (!pathInside(projectPath, absolutePath)) throw new Error("path escapes project directory")
  return absolutePath.slice(projectPath.length + 1)
}

async function resolveExistingProjectTarget(
  project: string,
  relativePath: string,
): Promise<{ projectPath: string; target: string }> {
  const { projectPath } = await resolveExistingProject(project)
  if (!relativePath) return { projectPath, target: projectPath }
  const target = Path.normalize(Path.join(projectPath, relativePath))
  if (!pathInside(projectPath, target)) throw new Error("path escapes project directory")
  const linkError = await rejectLinksOnPath(projectPath, target)
  if (linkError) throw new Error(linkError)
  return { projectPath, target }
}

async function scriptingTreePayload(args: Record<string, any>): Promise<Record<string, any>> {
  const project = typeof args.project === "string" ? args.project : ""
  const projectError = validateProjectName(project)
  if (projectError) throw new Error(projectError)
  const relativePath = optionalRelativePath(args.path)
  const maxDepth = integerOption(args.max_depth, 6, "max_depth", 1, 20)
  const maxEntries = integerOption(args.max_entries, 300, "max_entries", 1, MAX_TREE_ENTRIES)
  const { projectPath, target } = await resolveExistingProjectTarget(project, relativePath)
  if (!(await FileManager.isDirectory(target))) throw new Error("path is not a directory")

  const entries: Array<{ path: string; type: "file" | "directory" | "link"; size_bytes: number }> = []
  const queue: Array<{ absolutePath: string; depth: number }> = [{ absolutePath: target, depth: 0 }]
  let truncated = false

  while (queue.length > 0 && entries.length < maxEntries) {
    const current = queue.shift()
    if (!current) break
    const children = await FileManager.readDirectory(current.absolutePath, false)
    const normalizedChildren = children
      .map(entry => Path.normalize(Path.isAbsolute(entry) ? entry : Path.join(current.absolutePath, entry)))
      .filter(candidate => pathInside(projectPath, candidate) && candidate !== projectPath)
      .sort((a, b) => a.localeCompare(b))

    for (const candidate of normalizedChildren) {
      if (entries.length >= maxEntries) {
        truncated = true
        break
      }
      const relative = projectRelativePath(projectPath, candidate)
      if (await FileManager.isLink(candidate)) {
        entries.push({ path: relative, type: "link", size_bytes: 0 })
        continue
      }
      if (await FileManager.isDirectory(candidate)) {
        entries.push({ path: relative, type: "directory", size_bytes: 0 })
        const childDepth = current.depth + 1
        if (childDepth < maxDepth) queue.push({ absolutePath: candidate, depth: childDepth })
        continue
      }
      if (await FileManager.isFile(candidate)) {
        const stat = await FileManager.stat(candidate)
        entries.push({ path: relative, type: "file", size_bytes: stat.size })
      }
    }
  }

  if (queue.length > 0) truncated = true
  return {
    ok: true,
    project,
    path: relativePath,
    count: entries.length,
    truncated,
    max_depth: maxDepth,
    max_entries: maxEntries,
    entries,
  }
}

function searchPreview(line: string, column: number): string {
  if (line.length <= MAX_SEARCH_PREVIEW_CHARS) return line
  const half = Math.floor(MAX_SEARCH_PREVIEW_CHARS / 2)
  let start = Math.max(0, column - half)
  let end = Math.min(line.length, start + MAX_SEARCH_PREVIEW_CHARS)
  start = Math.max(0, end - MAX_SEARCH_PREVIEW_CHARS)
  const body = line.slice(start, end)
  return `${start > 0 ? "…" : ""}${body}${end < line.length ? "…" : ""}`
}

async function scriptingSearchPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const project = typeof args.project === "string" ? args.project : ""
  const projectError = validateProjectName(project)
  if (projectError) throw new Error(projectError)
  const query = typeof args.query === "string" ? args.query : ""
  if (!query || query.length > 512) throw new Error("query must contain between 1 and 512 characters")
  if (query.includes("\n") || query.includes("\r")) throw new Error("query must be a single line")
  const relativePath = optionalRelativePath(args.path)
  const caseSensitive = args.case_sensitive === undefined ? false : args.case_sensitive
  if (typeof caseSensitive !== "boolean") throw new Error("case_sensitive must be a boolean")
  const maxResults = integerOption(args.max_results, 50, "max_results", 1, MAX_SEARCH_RESULTS)
  const maxFiles = integerOption(args.max_files, 300, "max_files", 1, MAX_SEARCH_FILES)
  const { projectPath, target } = await resolveExistingProjectTarget(project, relativePath)

  const matches: Array<{ path: string; line: number; column: number; preview: string }> = []
  const queue: string[] = []
  const directFiles: string[] = []
  let scannedFiles = 0
  let scannedDirectories = 0
  let skippedBinary = 0
  let skippedLarge = 0
  let skippedLinks = 0
  let truncated = false

  if (await FileManager.isFile(target)) directFiles.push(target)
  else if (await FileManager.isDirectory(target)) queue.push(target)
  else throw new Error("path must be a file or directory")

  const needle = caseSensitive ? query : query.toLowerCase()

  async function scanFile(file: string): Promise<void> {
    if (scannedFiles >= maxFiles || matches.length >= maxResults) {
      truncated = true
      return
    }
    scannedFiles += 1
    const stat = await FileManager.stat(file)
    if (stat.size > MAX_SEARCH_FILE_BYTES) {
      skippedLarge += 1
      return
    }
    let text = ""
    try {
      text = (await readStrictUtf8File(file, MAX_SEARCH_FILE_BYTES, "search file")).text
    } catch {
      skippedBinary += 1
      return
    }
    const lines = text.split(/\r?\n/)
    const path = projectRelativePath(projectPath, file)
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex]
      const haystack = caseSensitive ? line : line.toLowerCase()
      let from = 0
      while (from <= haystack.length - needle.length) {
        const column = haystack.indexOf(needle, from)
        if (column < 0) break
        matches.push({
          path,
          line: lineIndex + 1,
          column: column + 1,
          preview: searchPreview(line, column),
        })
        if (matches.length >= maxResults) {
          truncated = true
          return
        }
        from = column + Math.max(1, needle.length)
      }
    }
  }

  for (const file of directFiles) await scanFile(file)

  while (queue.length > 0 && matches.length < maxResults) {
    if (scannedDirectories >= MAX_SEARCH_DIRECTORIES) {
      truncated = true
      break
    }
    const directory = queue.shift()
    if (!directory) break
    scannedDirectories += 1
    const children = await FileManager.readDirectory(directory, false)
    const normalizedChildren = children
      .map(entry => Path.normalize(Path.isAbsolute(entry) ? entry : Path.join(directory, entry)))
      .filter(candidate => pathInside(projectPath, candidate) && candidate !== projectPath)
      .sort((a, b) => a.localeCompare(b))

    for (const candidate of normalizedChildren) {
      if (await FileManager.isLink(candidate)) {
        skippedLinks += 1
        continue
      }
      if (await FileManager.isDirectory(candidate)) {
        queue.push(candidate)
        continue
      }
      if (await FileManager.isFile(candidate)) {
        if (scannedFiles >= maxFiles) {
          truncated = true
          break
        }
        await scanFile(candidate)
        if (matches.length >= maxResults) break
      }
    }
  }

  if (queue.length > 0) truncated = true
  return {
    ok: true,
    project,
    path: relativePath,
    query,
    case_sensitive: caseSensitive,
    scanned_files: scannedFiles,
    scanned_directories: scannedDirectories,
    skipped_binary: skippedBinary,
    skipped_large: skippedLarge,
    skipped_links: skippedLinks,
    count: matches.length,
    truncated,
    matches,
  }
}


function runResultType(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value
}

function serializeRunResult(value: unknown): string {
  if (value === undefined) return "null"
  try {
    const json = JSON.stringify(value)
    if (typeof json === "string") return json
  } catch {}
  return JSON.stringify(String(value))
}

function githubCompatNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) throw new Error("GitHub numeric parameter must be an integer")
  return parsed
}

function githubCompatInputs(value: string | undefined): Record<string, string> | undefined {
  if (!value) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error("inputs_json must be valid JSON")
  }
  if (!isPlainObject(parsed)) throw new Error("inputs_json must decode to an object")
  const result: Record<string, string> = {}
  for (const [key, raw] of Object.entries(parsed)) {
    if (typeof raw !== "string") throw new Error("inputs_json values must be strings")
    result[key] = raw
  }
  return result
}

async function scriptingGitHubCompatRunPayload(
  queryParameters: Record<string, string> | undefined,
): Promise<Record<string, any>> {
  const params = queryParameters ?? {}
  const action = (params.action ?? "status").trim()

  if (action === "status") return await scriptingGitHubStatusPayload()
  if (action === "push_preview" || action === "queue_preview") {
    return await scriptingGitHubQueuePreviewPayload(params)
  }

  throw new Error("unsupported @github action; use status or push_preview")
}

function snapshotFileMap(entries: PathSnapshotEntry[]): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>()
  for (const entry of entries) {
    if (entry.kind === "file" && entry.bytes) files.set(entry.relativePath, entry.bytes)
  }
  return files
}

function summarizeProjectSnapshotDiff(
  before: PathSnapshotEntry[],
  after: PathSnapshotEntry[],
): { added: number; modified: number; deleted: number; unchanged: number } {
  const oldFiles = snapshotFileMap(before)
  const newFiles = snapshotFileMap(after)
  let added = 0
  let modified = 0
  let deleted = 0
  let unchanged = 0

  for (const [path, bytes] of newFiles) {
    const previous = oldFiles.get(path)
    if (!previous) added += 1
    else if (sameBytes(previous, bytes)) unchanged += 1
    else modified += 1
  }
  for (const path of oldFiles.keys()) {
    if (!newFiles.has(path)) deleted += 1
  }
  return { added, modified, deleted, unchanged }
}

async function validateDeployStage(stage: string, project: string): Promise<void> {
  const manifestPath = Path.join(stage, "script.json")
  if (
    !(await FileManager.exists(manifestPath)) ||
    (await FileManager.isLink(manifestPath)) ||
    !(await FileManager.isFile(manifestPath))
  ) {
    throw new Error("deploy archive must contain a root script.json")
  }

  const manifestText = (await readStrictUtf8File(
    manifestPath,
    MAX_READ_FILE_BYTES,
    "deploy script.json",
  )).text
  let manifest: Record<string, any>
  try {
    const parsed = JSON.parse(manifestText)
    if (!isPlainObject(parsed)) throw new Error("root must be an object")
    manifest = parsed
  } catch (error) {
    throw new Error(`deploy script.json is invalid: ${safeError(error)}`)
  }

  if (typeof manifest.name !== "string" || !manifest.name.trim()) {
    throw new Error("deploy script.json.name must be a non-empty string")
  }
  if (manifest.name !== project) {
    throw new Error(`deploy manifest name ${manifest.name} does not match target project ${project}`)
  }

  const candidates = typeof manifest.entry === "string"
    ? [manifest.entry]
    : ["index.tsx", "index.ts", "index.js", "index.py", "widget.tsx", "intent.tsx"]
  let found = false
  for (const relative of candidates) {
    const pathError = validateRelativeFilePath(relative)
    if (pathError) {
      if (typeof manifest.entry === "string") throw new Error(`deploy entry is invalid: ${pathError}`)
      continue
    }
    const candidate = Path.normalize(Path.join(stage, relative))
    if (!pathInside(stage, candidate)) continue
    if (
      (await FileManager.exists(candidate)) &&
      !(await FileManager.isLink(candidate)) &&
      (await FileManager.isFile(candidate))
    ) {
      found = true
      break
    }
  }
  if (!found) throw new Error("deploy archive has no runnable entrypoint")
}

async function scriptingProjectDeployPreviewPayload(
  params: Record<string, string> | undefined,
): Promise<Record<string, any>> {
  const args = params ?? {}
  const project = githubStringArg(args, "project", 256)
  const projectError = validateProjectName(project)
  if (projectError) throw new Error(projectError)

  const archiveBase64 = typeof args.archive_base64 === "string" ? args.archive_base64.trim() : ""
  if (!archiveBase64 || archiveBase64.length > MAX_COMPRESSED_REPLACE_BASE64_CHARS) {
    throw new Error(`archive_base64 must contain 1 to ${MAX_COMPRESSED_REPLACE_BASE64_CHARS} characters`)
  }
  const expectedHash = typeof args.archive_sha256 === "string"
    ? args.archive_sha256.trim().toLowerCase()
    : ""
  if (expectedHash && !/^[0-9a-f]{64}$/.test(expectedHash)) {
    throw new Error("archive_sha256 must be 64 hex characters")
  }

  const archiveData = Data.fromBase64String(archiveBase64)
  if (!archiveData) throw new Error("archive_base64 is not valid Base64")
  const archiveBytes = archiveData.toUint8Array()
  if (!archiveBytes) throw new Error("failed to decode deploy archive")
  if (archiveBytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`deploy ZIP exceeds ${MAX_ARCHIVE_BYTES} byte safety limit`)
  }
  const actualHash = sha256Bytes(archiveBytes)
  if (expectedHash && actualHash !== expectedHash) {
    throw new Error("archive_sha256 does not match deploy archive")
  }
  const inspected = inspectZipArchive(archiveBytes)

  const { projectPath } = resolveProjectRootPath(project)
  let targetKind: ChangeTargetKind = "missing"
  let beforeEntries: PathSnapshotEntry[] = []
  let oldSizeBytes = 0
  if (await FileManager.exists(projectPath)) {
    if (await FileManager.isLink(projectPath)) throw new Error("deploy target cannot be a symbolic link")
    if (!(await FileManager.isDirectory(projectPath))) throw new Error("deploy target must be a project directory")
    targetKind = "directory"
    const before = await capturePathSnapshot(projectPath, "directory")
    beforeEntries = before.entries
    oldSizeBytes = before.totalBytes
  }

  const zipPath = temporaryArchivePath("deploy_preview", ".zip")
  const stage = temporaryArchivePath("deploy_preview_stage", "")
  let staged: { entries: PathSnapshotEntry[]; totalBytes: number }
  try {
    await FileManager.writeAsBytes(zipPath, archiveBytes)
    await FileManager.createDirectory(stage, false)
    await FileManager.unzip(zipPath, stage)
    staged = await capturePathSnapshot(stage, "directory")
    if (staged.totalBytes !== inspected.totalUncompressedBytes) {
      throw new Error("deploy archive extracted size does not match ZIP metadata")
    }
    await validateDeployStage(stage, project)
  } finally {
    await removeIfExists(stage)
    await removeIfExists(zipPath)
  }

  const diff = summarizeProjectSnapshotDiff(beforeEntries, staged.entries)
  if (diff.added === 0 && diff.modified === 0 && diff.deleted === 0) {
    return {
      ok: true,
      preview_id: "",
      operation: "project_deploy",
      project,
      no_changes: true,
      archive_sha256: actualHash,
      archive_size_bytes: archiveBytes.byteLength,
      file_count: snapshotFileMap(staged.entries).size,
      added_count: 0,
      modified_count: 0,
      deleted_count: 0,
      unchanged_count: diff.unchanged,
      old_size_bytes: oldSizeBytes,
      new_size_bytes: staged.totalBytes,
      expires_at: "",
      summary: `deploy package already matches ${project}`,
    }
  }

  pruneChangePreviews()
  const createdAt = Date.now()
  const preview: PendingChangePreview = {
    previewId: newChangePreviewId(),
    operation: "project_deploy",
    project,
    relativePath: "",
    destinationPath: null,
    content: null,
    expectedOriginal: null,
    expectedDeleteBytes: null,
    expectedPathSnapshot: beforeEntries,
    targetKind,
    oldSizeBytes,
    newSizeBytes: staged.totalBytes,
    createdAt,
    expiresAt: createdAt + CHANGE_PREVIEW_TTL_MS,
    binaryContent: archiveBytes,
    archiveEntries: inspected.entries,
    archiveUncompressedBytes: inspected.totalUncompressedBytes,
    restoreEntries: staged.entries,
  }
  pendingChangePreviews.set(preview.previewId, preview)

  return {
    ok: true,
    preview_id: preview.previewId,
    operation: preview.operation,
    project,
    no_changes: false,
    archive_sha256: actualHash,
    archive_size_bytes: archiveBytes.byteLength,
    file_count: snapshotFileMap(staged.entries).size,
    added_count: diff.added,
    modified_count: diff.modified,
    deleted_count: diff.deleted,
    unchanged_count: diff.unchanged,
    old_size_bytes: oldSizeBytes,
    new_size_bytes: staged.totalBytes,
    expires_at: new Date(preview.expiresAt).toISOString(),
    summary: `deploy ${project}: +${diff.added} ~${diff.modified} -${diff.deleted}`,
  }
}

async function applyProjectDeployPreview(
  previewId: string,
  preview: PendingChangePreview,
): Promise<Record<string, any>> {
  const archiveBytes = preview.binaryContent
  const expectedAfter = preview.restoreEntries
  if (!archiveBytes || !expectedAfter) {
    pendingChangePreviews.delete(previewId)
    throw new Error("internal error: deploy preview state is incomplete")
  }

  const { projectPath } = resolveProjectRootPath(preview.project)
  const targetExists = await FileManager.exists(projectPath)
  if (preview.targetKind === "missing") {
    if (targetExists) {
      pendingChangePreviews.delete(previewId)
      throw new Error("project_deploy preview is stale: target project now exists")
    }
  } else {
    if (!targetExists || (await FileManager.isLink(projectPath)) || !(await FileManager.isDirectory(projectPath))) {
      pendingChangePreviews.delete(previewId)
      throw new Error("project_deploy preview is stale: target project changed type")
    }
    const current = await capturePathSnapshot(projectPath, "directory")
    if (!preview.expectedPathSnapshot || !samePathSnapshot(current.entries, preview.expectedPathSnapshot)) {
      pendingChangePreviews.delete(previewId)
      throw new Error("project_deploy preview is stale: target project changed after preview")
    }
  }

  const inspected = inspectZipArchive(archiveBytes)
  if (inspected.totalUncompressedBytes !== (preview.archiveUncompressedBytes ?? -1)) {
    pendingChangePreviews.delete(previewId)
    throw new Error("project_deploy preview is stale: archive metadata changed")
  }

  const root = normalizedRoot()
  const zipPath = temporaryArchivePath("deploy_apply", ".zip")
  const stage = Path.join(
    root,
    `__ScriptingPlus_DeployStage_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
  )
  const backup = Path.join(
    root,
    `__ScriptingPlus_DeployBackup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
  )
  let backupCreated = false
  let committed = false

  try {
    await FileManager.writeAsBytes(zipPath, archiveBytes)
    if (await FileManager.exists(stage)) throw new Error("deploy staging path collision")
    await FileManager.createDirectory(stage, false)
    await FileManager.unzip(zipPath, stage)

    const staged = await capturePathSnapshot(stage, "directory")
    if (!samePathSnapshot(staged.entries, expectedAfter)) {
      throw new Error("deploy staging verification failed")
    }
    await validateDeployStage(stage, preview.project)

    pendingChangePreviews.delete(previewId)

    if (targetExists) {
      if (await FileManager.exists(backup)) throw new Error("deploy backup path collision")
      await FileManager.rename(projectPath, backup)
      backupCreated = true
    }

    await FileManager.rename(stage, projectPath)
    committed = true

    const finalState = await capturePathSnapshot(projectPath, "directory")
    if (!samePathSnapshot(finalState.entries, expectedAfter)) {
      throw new Error("deploy final verification failed")
    }

    if (backupCreated) {
      await FileManager.remove(backup)
      backupCreated = false
    }

    return {
      ok: true,
      preview_id: previewId,
      operation: "project_deploy",
      project: preview.project,
      path: "",
      size_bytes: preview.newSizeBytes,
      created: preview.targetKind === "missing",
      replaced: preview.targetKind === "directory",
      directory_created: false,
      deleted: false,
      moved: false,
      copied: false,
      destination_path: "",
    }
  } catch (error) {
    try {
      if (committed && (await FileManager.exists(projectPath))) {
        await FileManager.remove(projectPath)
      }
      if (backupCreated && (await FileManager.exists(backup))) {
        await FileManager.rename(backup, projectPath)
        backupCreated = false
      }
    } catch (rollbackError) {
      throw new Error(
        `project_deploy failed: ${safeError(error)}; rollback failed: ${safeError(rollbackError)}`,
      )
    }
    throw error
  } finally {
    await removeIfExists(stage)
    await removeIfExists(zipPath)
    if (backupCreated) await removeIfExists(backup)
  }
}

async function scriptingRunPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const project = typeof args.project === "string" ? args.project : ""
  const projectError = validateProjectName(project)
  if (projectError) throw new Error(projectError)
  if (project === "ScriptingPlus" || project === "Scripting Tunnel Probe") {
    throw new Error("running the MCP control project through scripting_run is not allowed")
  }

  const singleMode = args.single_mode === undefined ? true : args.single_mode
  if (typeof singleMode !== "boolean") throw new Error("single_mode must be a boolean")

  let queryParameters: Record<string, string> | undefined
  if (args.query_parameters !== undefined) {
    if (!isPlainObject(args.query_parameters)) throw new Error("query_parameters must be an object")
    const entries = Object.entries(args.query_parameters)
    if (entries.length > MAX_RUN_QUERY_PARAMETERS) {
      throw new Error(`query_parameters exceeds ${MAX_RUN_QUERY_PARAMETERS} entries`)
    }
    queryParameters = {}
    for (const [key, value] of entries) {
      if (!key || key.length > 256) throw new Error("query parameter names must contain 1 to 256 characters")
      if (typeof value !== "string") throw new Error("query parameter values must be strings")
      if (value.length > 4096) {
        throw new Error("query parameter values must not exceed 4096 characters")
      }
      queryParameters[key] = value
    }
  }

  let result: unknown
  if (project === "@github") {
    result = await scriptingGitHubCompatRunPayload(queryParameters)
  } else {
    await resolveExistingProject(project)
    result = await Script.run({
      name: project,
      ...(queryParameters ? { queryParameters } : {}),
      singleMode,
    })
  }

  const resultJson = serializeRunResult(result)
  const resultSizeBytes = utf8ByteLength(resultJson)
  if (resultSizeBytes > MAX_RUN_RESULT_BYTES) {
    throw new Error(`Script.run result exceeds ${MAX_RUN_RESULT_BYTES} byte result limit`)
  }
  return {
    ok: true,
    project,
    single_mode: singleMode,
    result_type: runResultType(result),
    result_json: resultJson,
    result_size_bytes: resultSizeBytes,
  }
}

async function scriptingEditPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const project = typeof args.project === "string" ? args.project : ""
  const relativePath = typeof args.path === "string" ? args.path : ""
  const oldText = typeof args.old_text === "string" ? args.old_text : ""
  const newText = typeof args.new_text === "string" ? args.new_text : null
  const expectedOccurrences = integerOption(
    args.expected_occurrences,
    1,
    "expected_occurrences",
    1,
    100,
  )

  if (!oldText) throw new Error("old_text must be a non-empty string")
  if (newText === null) throw new Error("new_text must be a string")

  const pathError = validateRelativeFilePath(relativePath)
  if (pathError) throw new Error(pathError)
  const { target } = await resolveExistingProjectTarget(project, relativePath)
  if (!(await FileManager.isFile(target))) throw new Error("edit requires an existing target file")
  const utf8 = await readStrictUtf8File(target, MAX_WRITE_FILE_BYTES, "existing file")
  const original = utf8.text
  let matchCount = 0
  let from = 0
  while (from <= original.length - oldText.length) {
    const at = original.indexOf(oldText, from)
    if (at < 0) break
    matchCount += 1
    if (matchCount > 100) break
    from = at + oldText.length
  }
  if (matchCount !== expectedOccurrences) {
    throw new Error(
      `old_text matched ${matchCount} occurrence(s); expected ${expectedOccurrences}`,
    )
  }

  const updated = original.split(oldText).join(newText)
  const preview = await scriptingChangePreviewPayload({
    operation: "replace",
    project,
    path: relativePath,
    content: updated,
  })
  return {
    ok: true,
    preview_id: preview.preview_id,
    operation: "replace",
    project,
    path: relativePath,
    match_count: matchCount,
    old_size_bytes: preview.old_size_bytes,
    new_size_bytes: preview.new_size_bytes,
    expires_at: preview.expires_at,
    summary: `edit ${project}/${relativePath} (${matchCount} exact replacement${matchCount === 1 ? "" : "s"})`,
  }
}

function defaultProjectSeed(project: string): ProjectSeedFile[] {
  const manifest = JSON.stringify({
    name: project,
    version: "0.1.0",
    description: "",
    icon: "doc.text",
    color: "rgba(0, 122, 255, 1.00)",
    runInApp: false,
    intentInputTypes: [],
    localizedNames: { zh: project, en: project },
    localizedDescriptions: { zh: "", en: "" },
    entry: "index.tsx",
  }, null, 2) + "\n"
  return [
    { relativePath: "index.tsx", content: 'import { Script } from "scripting"\n\nScript.exit()\n' },
    { relativePath: "script.json", content: manifest },
    { relativePath: "README.md", content: `# ${project}\n` },
  ]
}

function projectPreviewResult(
  preview: PendingChangePreview,
  entryCount: number,
  summary: string,
): Record<string, any> {
  return {
    ok: true,
    preview_id: preview.previewId,
    operation: preview.operation,
    project: preview.project,
    source_project: preview.sourceProject ?? "",
    entry_count: entryCount,
    total_size_bytes: preview.newSizeBytes || preview.oldSizeBytes,
    expires_at: new Date(preview.expiresAt).toISOString(),
    summary,
  }
}

async function scriptingProjectCreatePreviewPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const project = typeof args.project === "string" ? args.project : ""
  const { projectPath } = resolveProjectRootPath(project)
  if (await FileManager.exists(projectPath)) throw new Error("project already exists")
  const seed = defaultProjectSeed(project)
  const totalBytes = seed.reduce((sum, file) => sum + utf8ByteLength(file.content), 0)

  pruneChangePreviews()
  const createdAt = Date.now()
  const preview: PendingChangePreview = {
    previewId: newChangePreviewId(),
    operation: "create_project",
    project,
    relativePath: "",
    destinationPath: null,
    content: null,
    expectedOriginal: null,
    expectedDeleteBytes: null,
    expectedPathSnapshot: null,
    targetKind: "missing",
    oldSizeBytes: 0,
    newSizeBytes: totalBytes,
    createdAt,
    expiresAt: createdAt + CHANGE_PREVIEW_TTL_MS,
    sourceProject: null,
    projectSeedFiles: seed,
  }
  pendingChangePreviews.set(preview.previewId, preview)
  return projectPreviewResult(preview, seed.length, `create Scripting project ${project}`)
}

async function scriptingProjectClonePreviewPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const sourceProject = typeof args.source_project === "string" ? args.source_project : ""
  const project = typeof args.project === "string" ? args.project : ""
  if (sourceProject === project) throw new Error("project must differ from source_project")
  const { projectPath: sourcePath } = await resolveExistingProject(sourceProject)
  const { projectPath: targetPath } = resolveProjectRootPath(project)
  if (await FileManager.exists(targetPath)) throw new Error("destination project already exists")
  const snapshot = await capturePathSnapshot(sourcePath, "directory")

  pruneChangePreviews()
  const createdAt = Date.now()
  const preview: PendingChangePreview = {
    previewId: newChangePreviewId(),
    operation: "clone_project",
    project,
    relativePath: "",
    destinationPath: null,
    content: null,
    expectedOriginal: null,
    expectedDeleteBytes: null,
    expectedPathSnapshot: snapshot.entries,
    targetKind: "directory",
    oldSizeBytes: snapshot.totalBytes,
    newSizeBytes: snapshot.totalBytes,
    createdAt,
    expiresAt: createdAt + CHANGE_PREVIEW_TTL_MS,
    sourceProject,
    projectSeedFiles: null,
  }
  pendingChangePreviews.set(preview.previewId, preview)
  return projectPreviewResult(
    preview,
    snapshot.entries.length,
    `clone Scripting project ${sourceProject} -> ${project}`,
  )
}

async function scriptingProjectDeletePreviewPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const project = typeof args.project === "string" ? args.project : ""
  const confirmProject = typeof args.confirm_project === "string" ? args.confirm_project : ""
  if (confirmProject !== project) throw new Error("confirm_project must exactly match project")
  if (project === "ScriptingPlus" || project === "Scripting Tunnel Probe") {
    throw new Error("deleting an MCP control project is not allowed")
  }
  const { projectPath } = await resolveExistingProject(project)
  const snapshot = await capturePathSnapshot(projectPath, "directory")

  pruneChangePreviews()
  const createdAt = Date.now()
  const preview: PendingChangePreview = {
    previewId: newChangePreviewId(),
    operation: "delete_project",
    project,
    relativePath: "",
    destinationPath: null,
    content: null,
    expectedOriginal: null,
    expectedDeleteBytes: null,
    expectedPathSnapshot: snapshot.entries,
    targetKind: "directory",
    oldSizeBytes: snapshot.totalBytes,
    newSizeBytes: 0,
    createdAt,
    expiresAt: createdAt + CHANGE_PREVIEW_TTL_MS,
    sourceProject: null,
    projectSeedFiles: null,
  }
  pendingChangePreviews.set(preview.previewId, preview)
  return projectPreviewResult(preview, snapshot.entries.length, `delete complete Scripting project ${project}`)
}

function snapshotDirectoriesFirst(entries: PathSnapshotEntry[]): PathSnapshotEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1
    const depthA = a.relativePath.split("/").length
    const depthB = b.relativePath.split("/").length
    if (depthA !== depthB) return depthA - depthB
    return a.relativePath.localeCompare(b.relativePath)
  })
}

async function populateSnapshotDirectory(root: string, entries: PathSnapshotEntry[]): Promise<void> {
  for (const entry of snapshotDirectoriesFirst(entries)) {
    const target = Path.normalize(Path.join(root, entry.relativePath))
    if (!pathInside(root, target) || target === root) throw new Error("snapshot path escapes staging directory")
    if (entry.kind === "directory") {
      await FileManager.createDirectory(target, true)
      continue
    }
    if (!entry.bytes) throw new Error("snapshot file is missing bytes")
    const parent = Path.dirname(target)
    if (!(await FileManager.exists(parent))) await FileManager.createDirectory(parent, true)
    await FileManager.writeAsBytes(target, entry.bytes)
  }
}

async function populateSeedDirectory(root: string, seed: ProjectSeedFile[]): Promise<void> {
  for (const file of seed) {
    const error = validateRelativeFilePath(file.relativePath)
    if (error) throw new Error(`invalid seed path: ${error}`)
    const target = Path.normalize(Path.join(root, file.relativePath))
    if (!pathInside(root, target) || target === root) throw new Error("seed path escapes staging directory")
    const parent = Path.dirname(target)
    if (!(await FileManager.exists(parent))) await FileManager.createDirectory(parent, true)
    await FileManager.writeAsString(target, file.content)
  }
}

async function normalizeClonedManifest(root: string, project: string): Promise<void> {
  const manifestPath = Path.join(root, "script.json")
  if (!(await FileManager.exists(manifestPath))) return
  if (!(await FileManager.isFile(manifestPath)) || (await FileManager.isLink(manifestPath))) {
    throw new Error("clone manifest is not a regular file")
  }

  let manifest: any
  try {
    manifest = JSON.parse(await FileManager.readAsString(manifestPath))
  } catch {
    return
  }
  if (!isPlainObject(manifest)) return
  manifest.name = project
  await FileManager.writeAsString(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
}

function stagingProjectPath(root: string): string {
  return Path.join(root, `__ScriptingPlus_Stage_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`)
}

async function applyProjectPreview(previewId: string, preview: PendingChangePreview): Promise<Record<string, any>> {
  const { root, projectPath } = resolveProjectRootPath(preview.project)
  const operation = preview.operation

  if (operation === "create_project") {
    if (await FileManager.exists(projectPath)) {
      pendingChangePreviews.delete(previewId)
      throw new Error("create_project preview is stale: project now exists")
    }
    const seed = preview.projectSeedFiles
    if (!seed) throw new Error("internal error: missing project seed")
    pendingChangePreviews.delete(previewId)
    const stage = stagingProjectPath(root)
    try {
      if (await FileManager.exists(stage)) throw new Error("staging path collision")
      await FileManager.createDirectory(stage, false)
      await populateSeedDirectory(stage, seed)
      for (const file of seed) {
        const staged = Path.join(stage, file.relativePath)
        if (!(await FileManager.isFile(staged)) || (await FileManager.isLink(staged))) {
          throw new Error("project creation verification failed")
        }
        if ((await FileManager.readAsString(staged)) !== file.content) {
          throw new Error("project creation verification failed: content mismatch")
        }
      }
      if (await FileManager.exists(projectPath)) throw new Error("create_project preview is stale: project appeared before commit")
      await FileManager.rename(stage, projectPath)
    } catch (error) {
      if (await FileManager.exists(stage)) await FileManager.remove(stage)
      throw error
    }
    if (!(await FileManager.isDirectory(projectPath)) || (await FileManager.isLink(projectPath))) {
      throw new Error("project creation verification failed after commit")
    }
    return {
      ok: true, preview_id: previewId, operation, project: preview.project, path: "",
      size_bytes: preview.newSizeBytes, created: false, replaced: false, directory_created: true,
      deleted: false, moved: false, copied: false, destination_path: "",
    }
  }

  if (operation === "clone_project") {
    const sourceProject = preview.sourceProject
    if (!sourceProject || !preview.expectedPathSnapshot) throw new Error("internal error: missing clone snapshot")
    const { projectPath: sourcePath } = await resolveExistingProject(sourceProject)
    if (await FileManager.exists(projectPath)) {
      pendingChangePreviews.delete(previewId)
      throw new Error("clone_project preview is stale: destination now exists")
    }
    const current = await capturePathSnapshot(sourcePath, "directory")
    if (!samePathSnapshot(current.entries, preview.expectedPathSnapshot)) {
      pendingChangePreviews.delete(previewId)
      throw new Error("clone_project preview is stale: source changed after preview")
    }
    pendingChangePreviews.delete(previewId)
    const stage = stagingProjectPath(root)
    let committedSnapshot: PathSnapshotEntry[] | null = null
    let committedBytes = preview.newSizeBytes
    try {
      if (await FileManager.exists(stage)) throw new Error("staging path collision")
      await FileManager.createDirectory(stage, false)
      await populateSnapshotDirectory(stage, preview.expectedPathSnapshot)
      const stagedSource = await capturePathSnapshot(stage, "directory")
      if (!samePathSnapshot(stagedSource.entries, preview.expectedPathSnapshot)) {
        throw new Error("clone staging verification failed")
      }
      await normalizeClonedManifest(stage, preview.project)
      const staged = await capturePathSnapshot(stage, "directory")
      committedSnapshot = staged.entries
      committedBytes = staged.totalBytes
      if (await FileManager.exists(projectPath)) throw new Error("clone_project preview is stale: destination appeared before commit")
      await FileManager.rename(stage, projectPath)
    } catch (error) {
      if (await FileManager.exists(stage)) await FileManager.remove(stage)
      throw error
    }
    if (!committedSnapshot) throw new Error("clone verification failed: missing committed snapshot")
    const cloned = await capturePathSnapshot(projectPath, "directory")
    if (!samePathSnapshot(cloned.entries, committedSnapshot)) {
      throw new Error("clone verification failed: destination content mismatch")
    }
    return {
      ok: true, preview_id: previewId, operation, project: preview.project, path: "",
      size_bytes: committedBytes, created: false, replaced: false, directory_created: false,
      deleted: false, moved: false, copied: true, destination_path: "",
    }
  }

  if (operation === "delete_project") {
    if (preview.project === "ScriptingPlus" || preview.project === "Scripting Tunnel Probe") {
      pendingChangePreviews.delete(previewId)
      throw new Error("deleting an MCP control project is not allowed")
    }
    if (!preview.expectedPathSnapshot) throw new Error("internal error: missing project delete snapshot")
    const { projectPath: currentPath } = await resolveExistingProject(preview.project)
    const current = await capturePathSnapshot(currentPath, "directory")
    if (!samePathSnapshot(current.entries, preview.expectedPathSnapshot)) {
      pendingChangePreviews.delete(previewId)
      throw new Error("delete_project preview is stale: project changed after preview")
    }
    pendingChangePreviews.delete(previewId)
    await FileManager.remove(currentPath)
    if (await FileManager.exists(currentPath)) throw new Error("project delete verification failed")
    return {
      ok: true, preview_id: previewId, operation, project: preview.project, path: "",
      size_bytes: preview.oldSizeBytes, created: false, replaced: false, directory_created: false,
      deleted: true, moved: false, copied: false, destination_path: "",
    }
  }

  throw new Error("internal error: unsupported project preview operation")
}

function validationLineForKey(text: string, key: string): number {
  const lines = text.split(/\r?\n/)
  const needle = `"${key}"`
  const at = lines.findIndex(line => line.includes(needle))
  return at >= 0 ? at + 1 : 1
}

function validationIssue(
  issues: ValidationIssue[],
  severity: "error" | "warning",
  code: string,
  path: string,
  line: number,
  message: string,
): void {
  if (issues.length >= MAX_VALIDATE_ISSUES) return
  issues.push({ severity, code, path, line, message })
}

function codeFile(path: string): boolean {
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].some(ext => path.endsWith(ext))
}

function relativeImportSpecifiers(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("//")) return []
  const specs: string[] = []
  const patterns = [
    /^(?:import|export)\b.*?\bfrom\s*["'](\.{1,2}\/[^"']+)["']/,
    /^import\s*["'](\.{1,2}\/[^"']+)["']/,
    /\brequire\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/,
    /\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/,
  ]
  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match?.[1] && !specs.includes(match[1])) specs.push(match[1])
  }
  return specs
}

async function relativeImportExists(projectPath: string, sourceFile: string, specifier: string): Promise<boolean> {
  const clean = specifier.split(/[?#]/, 1)[0]
  const base = Path.normalize(Path.join(Path.dirname(sourceFile), clean))
  if (!pathInside(projectPath, base) || base === projectPath) return false
  const candidates = [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}.cjs`, `${base}.json`,
    Path.join(base, "index.ts"), Path.join(base, "index.tsx"), Path.join(base, "index.js"),
    Path.join(base, "index.jsx"), Path.join(base, "index.mjs"), Path.join(base, "index.cjs"),
  ]
  for (const candidate of candidates) {
    if (!pathInside(projectPath, candidate)) continue
    if (!(await FileManager.exists(candidate))) continue
    if (await FileManager.isLink(candidate)) continue
    if (await FileManager.isFile(candidate)) return true
  }
  return false
}

async function scriptingValidatePayload(args: Record<string, any>): Promise<Record<string, any>> {
  const project = typeof args.project === "string" ? args.project : ""
  const { projectPath } = await resolveExistingProject(project)
  const issues: ValidationIssue[] = []
  const files: string[] = []
  const directories: string[] = []
  const queue: string[] = [projectPath]
  let totalSizeBytes = 0
  let entriesSeen = 0

  while (queue.length > 0) {
    const directory = queue.shift()
    if (!directory) break
    const children = await FileManager.readDirectory(directory, false)
    const normalized = children
      .map(entry => Path.normalize(Path.isAbsolute(entry) ? entry : Path.join(directory, entry)))
      .filter(candidate => pathInside(projectPath, candidate) && candidate !== projectPath)
      .sort((a, b) => a.localeCompare(b))
    for (const candidate of normalized) {
      entriesSeen += 1
      if (entriesSeen > MAX_VALIDATE_ENTRIES) {
        validationIssue(issues, "error", "entry_limit", "", 1, `project exceeds ${MAX_VALIDATE_ENTRIES} validation entries`)
        queue.length = 0
        break
      }
      const relative = projectRelativePath(projectPath, candidate)
      if (await FileManager.isLink(candidate)) {
        validationIssue(issues, "error", "symbolic_link", relative, 1, "symbolic links are not supported by ScriptingPlus")
        continue
      }
      if (await FileManager.isDirectory(candidate)) {
        directories.push(candidate)
        queue.push(candidate)
        continue
      }
      if (!(await FileManager.isFile(candidate))) {
        validationIssue(issues, "warning", "unsupported_entry", relative, 1, "unsupported filesystem entry")
        continue
      }
      files.push(candidate)
      const stat = await FileManager.stat(candidate)
      totalSizeBytes += stat.size
      if (stat.size > MAX_READ_FILE_BYTES) {
        validationIssue(
          issues, "warning", "large_file", relative, 1,
          `file exceeds the ${MAX_READ_FILE_BYTES} byte interactive read limit`,
        )
      }
    }
  }

  const fileSet = new Set(files.map(file => projectRelativePath(projectPath, file)))
  const manifestPath = Path.join(projectPath, "script.json")
  let manifestText = ""
  let manifest: Record<string, any> | null = null
  if (!fileSet.has("script.json")) {
    validationIssue(issues, "error", "missing_manifest", "script.json", 1, "script.json is missing")
  } else {
    try {
      manifestText = (await readStrictUtf8File(manifestPath, MAX_READ_FILE_BYTES, "script.json")).text
      const parsed = JSON.parse(manifestText)
      if (!isPlainObject(parsed)) throw new Error("root must be an object")
      manifest = parsed
    } catch (error) {
      const message = safeError(error)
      if (message.includes("UTF-8 text")) {
        validationIssue(issues, "error", "binary_manifest", "script.json", 1, "script.json must be UTF-8 JSON text")
      } else {
        validationIssue(issues, "error", "invalid_manifest_json", "script.json", 1, `invalid JSON: ${message}`)
      }
    }
  }

  const entrypoints: string[] = []
  if (manifest) {
    if (typeof manifest.name !== "string" || !manifest.name.trim()) {
      validationIssue(issues, "error", "invalid_name", "script.json", validationLineForKey(manifestText, "name"), "manifest name must be a non-empty string")
    } else if (manifest.name !== project) {
      validationIssue(issues, "warning", "name_mismatch", "script.json", validationLineForKey(manifestText, "name"), `manifest name is ${manifest.name}; project directory is ${project}`)
    }
    if (manifest.version === undefined) {
      validationIssue(issues, "warning", "missing_version", "script.json", 1, "manifest version is missing")
    } else if (typeof manifest.version !== "string" || !manifest.version.trim()) {
      validationIssue(issues, "error", "invalid_version", "script.json", validationLineForKey(manifestText, "version"), "manifest version must be a non-empty string")
    }
    if (manifest.runInApp !== undefined && typeof manifest.runInApp !== "boolean") {
      validationIssue(issues, "error", "invalid_runInApp", "script.json", validationLineForKey(manifestText, "runInApp"), "runInApp must be a boolean")
    }
    if (manifest.intentInputTypes !== undefined && !Array.isArray(manifest.intentInputTypes)) {
      validationIssue(issues, "error", "invalid_intentInputTypes", "script.json", validationLineForKey(manifestText, "intentInputTypes"), "intentInputTypes must be an array")
    }
    if (manifest.localizedNames !== undefined && !isPlainObject(manifest.localizedNames)) {
      validationIssue(issues, "error", "invalid_localizedNames", "script.json", validationLineForKey(manifestText, "localizedNames"), "localizedNames must be an object")
    }

    if (manifest.entry !== undefined) {
      if (typeof manifest.entry !== "string") {
        validationIssue(issues, "error", "invalid_entry", "script.json", validationLineForKey(manifestText, "entry"), "entry must be a relative string path")
      } else {
        const pathError = validateRelativeFilePath(manifest.entry)
        if (pathError) {
          validationIssue(issues, "error", "invalid_entry", "script.json", validationLineForKey(manifestText, "entry"), pathError)
        } else if (!fileSet.has(manifest.entry)) {
          validationIssue(issues, "error", "missing_entry", manifest.entry, 1, "manifest entry file does not exist")
        } else {
          entrypoints.push(manifest.entry)
        }
      }
    }
  }

  if (entrypoints.length === 0) {
    for (const candidate of ["index.tsx", "index.ts", "index.js", "index.py", "widget.tsx", "intent.tsx"]) {
      if (fileSet.has(candidate)) entrypoints.push(candidate)
    }
  }
  if (entrypoints.length === 0) {
    validationIssue(issues, "error", "missing_entrypoint", "", 1, "no runnable entrypoint was detected")
  }

  for (const file of files) {
    const relative = projectRelativePath(projectPath, file)
    if (!codeFile(relative)) continue
    const stat = await FileManager.stat(file)
    if (stat.size > MAX_READ_FILE_BYTES) continue
    let text = ""
    try {
      text = (await readStrictUtf8File(file, MAX_READ_FILE_BYTES, "code file")).text
    } catch {
      continue
    }
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      for (const specifier of relativeImportSpecifiers(lines[i])) {
        if (!(await relativeImportExists(projectPath, file, specifier))) {
          validationIssue(
            issues, "error", "unresolved_relative_import", relative, i + 1,
            `could not resolve relative import ${specifier}`,
          )
        }
      }
    }
  }

  const errorCount = issues.filter(issue => issue.severity === "error").length
  const warningCount = issues.filter(issue => issue.severity === "warning").length
  return {
    ok: true,
    project,
    valid: errorCount === 0,
    error_count: errorCount,
    warning_count: warningCount,
    file_count: files.length,
    directory_count: directories.length,
    total_size_bytes: totalSizeBytes,
    entrypoints,
    issues,
  }
}

async function scriptingHashPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const project = typeof args.project === "string" ? args.project : ""
  const relativePath = optionalRelativePath(args.path)
  const { target } = await resolveExistingProjectTarget(project, relativePath)

  if (await FileManager.isFile(target)) {
    const stat = await FileManager.stat(target)
    if (stat.size > MAX_HASH_BYTES) throw new Error(`file exceeds ${MAX_HASH_BYTES} byte hash limit`)
    return {
      ok: true, project, path: relativePath, type: "file", algorithm: "sha256",
      sha256: await fileSha256(target), size_bytes: stat.size, file_count: 1, entry_count: 1,
    }
  }
  if (!(await FileManager.isDirectory(target))) throw new Error("path must be a file or directory")

  const queue: string[] = [target]
  const directories: string[] = []
  const files: Array<{ absolute: string; relative: string; size: number }> = []
  let totalBytes = 0
  let entries = 0
  while (queue.length > 0) {
    const directory = queue.shift()
    if (!directory) break
    const children = await FileManager.readDirectory(directory, false)
    const normalized = children
      .map(entry => Path.normalize(Path.isAbsolute(entry) ? entry : Path.join(directory, entry)))
      .filter(candidate => pathInside(target, candidate) && candidate !== target)
      .sort((a, b) => a.localeCompare(b))
    for (const candidate of normalized) {
      entries += 1
      if (entries > MAX_HASH_ENTRIES) throw new Error(`directory exceeds ${MAX_HASH_ENTRIES} hash entries`)
      if (await FileManager.isLink(candidate)) throw new Error("symbolic links are not hashable")
      const relative = candidate.slice(target.length + 1)
      if (await FileManager.isDirectory(candidate)) {
        directories.push(relative)
        queue.push(candidate)
        continue
      }
      if (!(await FileManager.isFile(candidate))) throw new Error("directory contains an unsupported filesystem entry")
      const stat = await FileManager.stat(candidate)
      totalBytes += stat.size
      if (totalBytes > MAX_HASH_BYTES) throw new Error(`directory exceeds ${MAX_HASH_BYTES} byte hash limit`)
      files.push({ absolute: candidate, relative, size: stat.size })
    }
  }

  directories.sort((a, b) => a.localeCompare(b))
  files.sort((a, b) => a.relative.localeCompare(b.relative))
  const canonical: string[] = []
  for (const directory of directories) canonical.push(`D\t${directory}\n`)
  for (const file of files) canonical.push(`F\t${file.relative}\t${file.size}\t${await fileSha256(file.absolute)}\n`)
  const digest = sha256Data(Data.fromString(canonical.join("")))
  return {
    ok: true, project, path: relativePath, type: "directory", algorithm: "sha256",
    sha256: digest, size_bytes: totalBytes, file_count: files.length,
    entry_count: directories.length + files.length,
  }
}

function githubStringArg(args: Record<string, any>, name: string, maxLength = 512): string {
  const value = typeof args[name] === "string" ? args[name].trim() : ""
  if (!value) throw new Error(`${name} is required`)
  if (value.length > maxLength) throw new Error(`${name} exceeds ${maxLength} characters`)
  if (value.includes("\0")) throw new Error(`${name} contains a null character`)
  return value
}

async function githubAvailability(): Promise<Record<string, any>> {
  const value = await Promise.resolve(GitHub.getAvailability())
  return isPlainObject(value) ? value : {}
}

async function requireGitHubPermissions(permissions: string[]): Promise<void> {
  const availability = await githubAvailability()
  if (availability.available !== true) {
    if (availability.tokenConfigured !== true) {
      throw new Error("GitHub token is not configured in Scripting Settings → GitHub")
    }
    if (availability.proRequired === true) {
      throw new Error("Scripting GitHub API requires Scripting PRO")
    }
    throw new Error("Scripting GitHub API is unavailable")
  }

  const granted = await GitHub.requestPermissions(permissions as any)
  const allowed = Array.isArray(granted) ? granted.map(value => String(value)) : []
  for (const permission of permissions) {
    if (!allowed.includes(permission)) {
      throw new Error(`GitHub permission not granted: ${permission}`)
    }
  }
}

async function scriptingGitHubStatusPayload(): Promise<Record<string, any>> {
  const availability = await githubAvailability()
  const permissionNames = [
    "read_profile", "read_repos", "read_contents", "write_contents",
    "read_actions", "write_actions",
  ]
  const permissions: Record<string, string> = {}
  for (const permission of permissionNames) {
    try {
      permissions[permission] = String(await GitHub.getPermissionStatus({ permission } as any))
    } catch {
      permissions[permission] = "unavailable"
    }
  }
  return {
    ok: true,
    available: availability.available === true,
    token_configured: availability.tokenConfigured === true,
    pro_required: availability.proRequired === true,
    permissions,
  }
}

function githubNotFoundError(error: unknown): boolean {
  const message = safeError(error).toLowerCase()
  return /(^|[^0-9])404([^0-9]|$)/.test(message) || message.includes("not found")
}

function githubRequestArgs(
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Record<string, any> {
  const value: Record<string, any> = { owner, repo, path }
  if (branch) value.ref = branch
  return value
}

async function githubRemoteFile(
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<{ sha: string; size: number } | null> {
  try {
    const value = await GitHub.getContent(githubRequestArgs(owner, repo, path, branch) as any)
    if (Array.isArray(value)) throw new Error("GitHub path is a directory, not a file")
    if (!isPlainObject(value) || typeof value.sha !== "string" || !value.sha) {
      throw new Error("GitHub file metadata is invalid")
    }
    return {
      sha: value.sha,
      size: Number.isInteger(value.size) && value.size >= 0 ? value.size : 0,
    }
  } catch (error) {
    if (githubNotFoundError(error)) return null
    throw error
  }
}

function normalizeGitHubRemotePrefix(value: unknown): string {
  if (value === undefined || value === null || value === "") return ""
  if (typeof value !== "string") throw new Error("remote_prefix must be a string")
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "")
  if (!trimmed) return ""
  if (trimmed.includes("\0") || trimmed.includes("\\")) {
    throw new Error("remote_prefix contains an invalid character")
  }
  const segments = trimmed.split("/")
  if (segments.some(segment => !segment || segment === "." || segment === "..")) {
    throw new Error("remote_prefix contains an invalid path segment")
  }
  if (trimmed.length > 2048) throw new Error("remote_prefix exceeds 2048 characters")
  return trimmed
}

function githubBlobSha(bytes: Uint8Array): string {
  const header = Data.fromRawString(`blob ${bytes.byteLength}\0`)
  const body = Data.fromUint8Array(bytes)
  if (!header || !body) throw new Error("failed to construct Git blob data")
  return Crypto.sha1(Data.combine([header, body])).toHexString()
}

async function githubRemoteTree(
  owner: string,
  repo: string,
  prefix: string,
  branch: string,
): Promise<Map<string, { sha: string; size: number }>> {
  const files = new Map<string, { sha: string; size: number }>()
  const queue: string[] = [prefix]
  let entries = 0

  while (queue.length > 0) {
    const path = queue.shift()
    if (path === undefined) break

    let value: unknown
    try {
      value = await GitHub.getContent(githubRequestArgs(owner, repo, path, branch) as any)
    } catch (error) {
      if (path === prefix && githubNotFoundError(error)) return files
      throw error
    }

    if (!Array.isArray(value)) {
      if (!isPlainObject(value) || typeof value.sha !== "string" || !value.sha) {
        throw new Error("GitHub remote tree contains invalid file metadata")
      }
      files.set(
        typeof value.path === "string" && value.path ? value.path : path,
        {
          sha: value.sha,
          size: Number.isInteger(value.size) && value.size >= 0 ? value.size : 0,
        },
      )
      entries += 1
      if (entries > MAX_PATH_MUTATION_ENTRIES) {
        throw new Error(`GitHub remote tree exceeds ${MAX_PATH_MUTATION_ENTRIES} entry safety limit`)
      }
      continue
    }

    for (const item of value) {
      if (!isPlainObject(item)) continue
      const itemPath = typeof item.path === "string" ? item.path : ""
      const type = typeof item.type === "string" ? item.type : ""
      if (!itemPath) continue
      entries += 1
      if (entries > MAX_PATH_MUTATION_ENTRIES) {
        throw new Error(`GitHub remote tree exceeds ${MAX_PATH_MUTATION_ENTRIES} entry safety limit`)
      }
      if (type === "dir") {
        queue.push(itemPath)
        continue
      }
      if (type !== "file" || typeof item.sha !== "string" || !item.sha) continue
      files.set(itemPath, {
        sha: item.sha,
        size: Number.isInteger(item.size) && item.size >= 0 ? item.size : 0,
      })
    }
  }

  return files
}

async function scriptingGitHubQueuePreviewPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const owner = githubStringArg(args, "owner", 128)
  const repo = githubStringArg(args, "repo", 128)
  const localProject = githubStringArg(args, "local_project", 256)
  const message = githubStringArg(args, "message", 512)
  const branch = optionalGitHubBranch(args)
  const remotePrefix = normalizeGitHubRemotePrefix(args.remote_prefix)

  const { projectPath } = await resolveExistingProject(localProject)
  await requireGitHubPermissions(["read_repos", "read_contents", "write_contents"])

  const captured = await capturePathSnapshot(projectPath, "directory")
  const remoteFiles = await githubRemoteTree(owner, repo, remotePrefix, branch)
  const queuedFiles: GitHubQueuedFilePreview[] = []
  let unchangedCount = 0
  let changedCount = 0
  let changedBytes = 0

  for (const entry of captured.entries) {
    if (entry.kind !== "file" || !entry.bytes) continue
    const remotePath = remotePrefix ? `${remotePrefix}/${entry.relativePath}` : entry.relativePath
    const localSha = githubBlobSha(entry.bytes)
    const remote = remoteFiles.get(remotePath) ?? null
    const needsWrite = remote?.sha !== localSha
    if (needsWrite) {
      changedCount += 1
      changedBytes += entry.bytes.byteLength
    } else {
      unchangedCount += 1
    }
    queuedFiles.push({
      localPath: entry.relativePath,
      remotePath,
      bytes: entry.bytes,
      expectedRemoteSha: remote?.sha ?? null,
      expectedRemoteExists: remote !== null,
      gitBlobSha: localSha,
      sizeBytes: entry.bytes.byteLength,
      needsWrite,
    })
  }

  const localFileCount = captured.entries.filter(entry => entry.kind === "file").length
  const remoteExtraCount = [...remoteFiles.keys()].filter(remotePath => {
    const relative = remotePrefix
      ? remotePath.startsWith(`${remotePrefix}/`)
        ? remotePath.slice(remotePrefix.length + 1)
        : ""
      : remotePath
    if (!relative) return false
    return !captured.entries.some(entry => entry.kind === "file" && entry.relativePath === relative)
  }).length

  if (changedCount === 0) {
    return {
      ok: true,
      preview_id: "",
      operation: "github_queue",
      repository: `${owner}/${repo}`,
      branch,
      remote_prefix: remotePrefix,
      local_project: localProject,
      change_count: 0,
      unchanged_count: unchangedCount,
      local_file_count: localFileCount,
      remote_extra_count: remoteExtraCount,
      new_size_bytes: 0,
      no_changes: true,
      summary: `GitHub queue is already synchronized for ${localProject}`,
    }
  }

  pruneChangePreviews()
  const previewId = newChangePreviewId()
  const createdAt = Date.now()
  const expiresAt = createdAt + CHANGE_PREVIEW_TTL_MS
  pendingChangePreviews.set(previewId, {
    previewId,
    operation: "github_queue",
    project: localProject,
    relativePath: remotePrefix,
    destinationPath: null,
    content: null,
    expectedOriginal: null,
    expectedDeleteBytes: null,
    expectedPathSnapshot: captured.entries,
    targetKind: "directory",
    oldSizeBytes: 0,
    newSizeBytes: changedBytes,
    createdAt,
    expiresAt,
    githubOwner: owner,
    githubRepo: repo,
    githubBranch: branch,
    githubMessage: message,
    githubQueuedFiles: queuedFiles,
  })

  return {
    ok: true,
    preview_id: previewId,
    operation: "github_queue",
    repository: `${owner}/${repo}`,
    branch,
    remote_prefix: remotePrefix,
    local_project: localProject,
    change_count: changedCount,
    unchanged_count: unchangedCount,
    local_file_count: localFileCount,
    remote_extra_count: remoteExtraCount,
    new_size_bytes: changedBytes,
    no_changes: false,
    expires_at: new Date(expiresAt).toISOString(),
    summary: `queue ${changedCount} GitHub file change(s) from ${localProject}`,
  }
}

function optionalGitHubBranch(args: Record<string, any>): string {
  return args.branch === undefined ? "" : githubStringArg(args, "branch", 256)
}

async function scriptingGitHubPutPreviewPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const owner = githubStringArg(args, "owner", 128)
  const repo = githubStringArg(args, "repo", 128)
  const path = githubStringArg(args, "path", 2048)
  const message = githubStringArg(args, "message", 512)
  const branch = optionalGitHubBranch(args)
  if (typeof args.content !== "string") throw new Error("content must be a string")
  const content = args.content
  const newSizeBytes = utf8ByteLength(content)
  if (newSizeBytes > MAX_WRITE_FILE_BYTES) {
    throw new Error(`content exceeds ${MAX_WRITE_FILE_BYTES} byte write limit`)
  }

  await requireGitHubPermissions(["read_repos", "read_contents", "write_contents"])
  const current = await githubRemoteFile(owner, repo, path, branch)

  pruneChangePreviews()
  const previewId = newChangePreviewId()
  const createdAt = Date.now()
  const expiresAt = createdAt + CHANGE_PREVIEW_TTL_MS
  pendingChangePreviews.set(previewId, {
    previewId,
    operation: "github_put",
    project: `${owner}/${repo}`,
    relativePath: path,
    destinationPath: null,
    content,
    expectedOriginal: null,
    expectedDeleteBytes: null,
    expectedPathSnapshot: null,
    targetKind: current ? "file" : "missing",
    oldSizeBytes: current?.size ?? 0,
    newSizeBytes,
    createdAt,
    expiresAt,
    githubOwner: owner,
    githubRepo: repo,
    githubBranch: branch,
    githubMessage: message,
    githubExpectedSha: current?.sha ?? null,
    githubExpectedExists: current !== null,
  })

  return {
    ok: true,
    preview_id: previewId,
    operation: "github_put",
    repository: `${owner}/${repo}`,
    path,
    branch,
    target_exists: current !== null,
    old_sha: current?.sha ?? "",
    old_size_bytes: current?.size ?? 0,
    new_size_bytes: newSizeBytes,
    expires_at: new Date(expiresAt).toISOString(),
    summary: `${current ? "update" : "create"} GitHub file ${owner}/${repo}:${path}${branch ? ` @ ${branch}` : ""}`,
  }
}

async function scriptingGitHubDeletePreviewPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const owner = githubStringArg(args, "owner", 128)
  const repo = githubStringArg(args, "repo", 128)
  const path = githubStringArg(args, "path", 2048)
  const message = githubStringArg(args, "message", 512)
  const branch = optionalGitHubBranch(args)

  await requireGitHubPermissions(["read_repos", "read_contents", "write_contents"])
  const current = await githubRemoteFile(owner, repo, path, branch)
  if (!current) throw new Error("GitHub delete requires an existing file")

  pruneChangePreviews()
  const previewId = newChangePreviewId()
  const createdAt = Date.now()
  const expiresAt = createdAt + CHANGE_PREVIEW_TTL_MS
  pendingChangePreviews.set(previewId, {
    previewId,
    operation: "github_delete",
    project: `${owner}/${repo}`,
    relativePath: path,
    destinationPath: null,
    content: null,
    expectedOriginal: null,
    expectedDeleteBytes: null,
    expectedPathSnapshot: null,
    targetKind: "file",
    oldSizeBytes: current.size,
    newSizeBytes: 0,
    createdAt,
    expiresAt,
    githubOwner: owner,
    githubRepo: repo,
    githubBranch: branch,
    githubMessage: message,
    githubExpectedSha: current.sha,
    githubExpectedExists: true,
  })

  return {
    ok: true,
    preview_id: previewId,
    operation: "github_delete",
    repository: `${owner}/${repo}`,
    path,
    branch,
    target_exists: true,
    old_sha: current.sha,
    old_size_bytes: current.size,
    new_size_bytes: 0,
    expires_at: new Date(expiresAt).toISOString(),
    summary: `delete GitHub file ${owner}/${repo}:${path}${branch ? ` @ ${branch}` : ""}`,
  }
}

async function applyGitHubQueuePreview(
  previewId: string,
  preview: PendingChangePreview,
): Promise<Record<string, any>> {
  const owner = preview.githubOwner ?? ""
  const repo = preview.githubRepo ?? ""
  const branch = preview.githubBranch ?? ""
  const message = preview.githubMessage ?? ""
  const queuedFiles = preview.githubQueuedFiles ?? []
  const expectedSnapshot = preview.expectedPathSnapshot

  if (!owner || !repo || !message || queuedFiles.length < 1 || !expectedSnapshot) {
    pendingChangePreviews.delete(previewId)
    throw new Error("internal error: GitHub queue preview state is incomplete")
  }

  await requireGitHubPermissions(["read_repos", "read_contents", "write_contents"])

  const { projectPath } = await resolveExistingProject(preview.project)
  const currentLocal = await capturePathSnapshot(projectPath, "directory")
  if (!samePathSnapshot(currentLocal.entries, expectedSnapshot)) {
    pendingChangePreviews.delete(previewId)
    throw new Error("github_queue preview is stale: local project changed after preview")
  }

  for (const item of queuedFiles) {
    const current = await githubRemoteFile(owner, repo, item.remotePath, branch)
    if (item.expectedRemoteExists) {
      if (!current || !item.expectedRemoteSha || current.sha !== item.expectedRemoteSha) {
        pendingChangePreviews.delete(previewId)
        throw new Error(`github_queue preview is stale: remote file changed: ${item.remotePath}`)
      }
    } else if (current) {
      pendingChangePreviews.delete(previewId)
      throw new Error(`github_queue preview is stale: remote file now exists: ${item.remotePath}`)
    }
  }

  pendingChangePreviews.delete(previewId)

  const writeFiles = queuedFiles.filter(item => item.needsWrite)
  const commits: Array<{ path: string; sha: string; commit_sha: string }> = []
  try {
    for (const item of writeFiles) {
      const content = Data.fromUint8Array(item.bytes)
      if (!content) throw new Error(`failed to construct GitHub content: ${item.localPath}`)

      const request: Record<string, any> = {
        owner,
        repo,
        path: item.remotePath,
        message,
        content,
      }
      if (branch) request.branch = branch
      if (item.expectedRemoteExists && item.expectedRemoteSha) {
        request.sha = item.expectedRemoteSha
      }

      const result = await GitHub.putContent(request as any)
      const verified = await githubRemoteFile(owner, repo, item.remotePath, branch)
      if (!verified || verified.sha !== item.gitBlobSha) {
        throw new Error(`GitHub queue verification failed: ${item.remotePath}`)
      }

      commits.push({
        path: item.remotePath,
        sha: verified.sha,
        commit_sha: githubCommitSha(result),
      })
    }
  } catch (error) {
    const applied = commits.map(item => item.path)
    throw new Error(
      `github_queue apply failed after ${commits.length}/${writeFiles.length} file(s): ${safeError(error)}` +
      (applied.length > 0 ? `; already committed: ${applied.join(", ")}` : ""),
    )
  }

  return {
    ok: true,
    preview_id: previewId,
    operation: "github_queue",
    project: `${owner}/${repo}`,
    path: preview.relativePath,
    size_bytes: preview.newSizeBytes,
    created: false,
    replaced: false,
    directory_created: false,
    deleted: false,
    moved: false,
    copied: false,
    destination_path: "",
    change_count: writeFiles.length,
    commit_count: commits.length,
    commits,
  }
}

function githubCommitSha(value: unknown): string {
  if (!isPlainObject(value)) return ""
  const commit = isPlainObject(value.commit) ? value.commit : {}
  return typeof commit.sha === "string" ? commit.sha : ""
}

async function applyGitHubPreview(
  previewId: string,
  preview: PendingChangePreview,
): Promise<Record<string, any>> {
  const owner = preview.githubOwner ?? ""
  const repo = preview.githubRepo ?? ""
  const branch = preview.githubBranch ?? ""
  const message = preview.githubMessage ?? ""
  const expectedExists = preview.githubExpectedExists === true
  if (!owner || !repo || !preview.relativePath || !message) {
    pendingChangePreviews.delete(previewId)
    throw new Error("internal error: GitHub preview state is incomplete")
  }

  await requireGitHubPermissions(["read_repos", "read_contents", "write_contents"])
  const current = await githubRemoteFile(owner, repo, preview.relativePath, branch)
  if (expectedExists) {
    if (!current) {
      pendingChangePreviews.delete(previewId)
      throw new Error(`${preview.operation} preview is stale: remote file no longer exists`)
    }
    if (!preview.githubExpectedSha || current.sha !== preview.githubExpectedSha) {
      pendingChangePreviews.delete(previewId)
      throw new Error(`${preview.operation} preview is stale: remote SHA changed after preview`)
    }
  } else if (current) {
    pendingChangePreviews.delete(previewId)
    throw new Error(`${preview.operation} preview is stale: remote file now exists`)
  }

  pendingChangePreviews.delete(previewId)
  const common: Record<string, any> = {
    owner,
    repo,
    path: preview.relativePath,
    message,
  }
  if (branch) common.branch = branch

  if (preview.operation === "github_put") {
    if (preview.content === null) throw new Error("internal error: GitHub write content is missing")
    common.content = preview.content
    if (expectedExists && preview.githubExpectedSha) common.sha = preview.githubExpectedSha
    const result = await GitHub.putContent(common as any)

    const contentData = Data.fromRawString(preview.content)
    const contentBytes = contentData?.toUint8Array() ?? null
    if (!contentBytes) throw new Error("failed to construct GitHub verification bytes")
    const expectedBlobSha = githubBlobSha(contentBytes)
    const verified = await githubRemoteFile(owner, repo, preview.relativePath, branch)
    if (!verified || verified.sha !== expectedBlobSha) {
      throw new Error("GitHub write verification failed")
    }
    return {
      ok: true,
      preview_id: previewId,
      operation: preview.operation,
      project: `${owner}/${repo}`,
      path: preview.relativePath,
      size_bytes: utf8ByteLength(preview.content),
      created: !expectedExists,
      replaced: expectedExists,
      directory_created: false,
      deleted: false,
      moved: false,
      copied: false,
      destination_path: "",
      repository: `${owner}/${repo}`,
      branch,
      commit_sha: githubCommitSha(result),
    }
  }

  if (preview.operation !== "github_delete" || !preview.githubExpectedSha) {
    throw new Error("internal error: invalid GitHub preview operation")
  }
  common.sha = preview.githubExpectedSha
  const result = await GitHub.deleteContent(common as any)
  const verified = await githubRemoteFile(owner, repo, preview.relativePath, branch)
  if (verified) throw new Error("GitHub delete verification failed: remote file still exists")
  return {
    ok: true,
    preview_id: previewId,
    operation: preview.operation,
    project: `${owner}/${repo}`,
    path: preview.relativePath,
    size_bytes: preview.oldSizeBytes,
    created: false,
    replaced: false,
    directory_created: false,
    deleted: true,
    moved: false,
    copied: false,
    destination_path: "",
    repository: `${owner}/${repo}`,
    branch,
    commit_sha: githubCommitSha(result),
  }
}

function utf8ByteLength(value: string): number {
  let bytes = 0
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x80) {
      bytes += 1
    } else if (code < 0x800) {
      bytes += 2
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        i += 1
      } else {
        bytes += 3
      }
    } else {
      bytes += 3
    }
  }
  return bytes
}

function resolveProjectRootPath(project: string): { root: string; projectPath: string } {
  const projectError = validateProjectName(project)
  if (projectError) throw new Error(projectError)
  const root = normalizedRoot()
  const projectPath = Path.normalize(Path.join(root, project))
  if (!pathInside(root, projectPath) || projectPath === root || Path.dirname(projectPath) !== root) {
    throw new Error("project escapes scriptsDirectory")
  }
  return { root, projectPath }
}

async function resolveExistingProject(project: string): Promise<{ root: string; projectPath: string }> {
  const { root, projectPath } = resolveProjectRootPath(project)
  if (!(await FileManager.exists(projectPath))) throw new Error("project does not exist")
  const projectLinkError = await rejectLinksOnPath(root, projectPath)
  if (projectLinkError) throw new Error(projectLinkError)
  if (!(await FileManager.isDirectory(projectPath))) throw new Error("project is not a directory")
  return { root, projectPath }
}

async function resolveMutationTarget(project: string, relativePath: string): Promise<{ projectPath: string; target: string }> {
  const pathError = validateRelativeFilePath(relativePath)
  if (pathError) throw new Error(pathError)
  const { projectPath } = await resolveExistingProject(project)
  const target = Path.normalize(Path.join(projectPath, relativePath))
  if (!pathInside(projectPath, target) || target === projectPath) {
    throw new Error("path escapes project directory")
  }
  const parent = Path.dirname(target)
  if (!pathInside(projectPath, parent)) throw new Error("parent escapes project directory")
  const parentLinkError = await rejectLinksOnPath(projectPath, parent)
  if (parentLinkError) throw new Error(parentLinkError)
  if (!(await FileManager.isDirectory(parent))) throw new Error("parent path is not a directory")
  return { projectPath, target }
}

function pruneChangePreviews(now = Date.now()): void {
  for (const [id, preview] of pendingChangePreviews) {
    if (preview.expiresAt <= now) pendingChangePreviews.delete(id)
  }
  while (pendingChangePreviews.size > MAX_PENDING_CHANGE_PREVIEWS) {
    const oldest = pendingChangePreviews.keys().next().value
    if (typeof oldest !== "string") break
    pendingChangePreviews.delete(oldest)
  }
}

function reserveChangePreviewSlot(): void {
  pruneChangePreviews()
  while (pendingChangePreviews.size >= MAX_PENDING_CHANGE_PREVIEWS) {
    const oldest = pendingChangePreviews.keys().next().value
    if (typeof oldest !== "string") break
    pendingChangePreviews.delete(oldest)
  }
}

function newChangePreviewId(): string {
  reserveChangePreviewSlot()
  return `chg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}


function samePathSnapshot(a: PathSnapshotEntry[], b: PathSnapshotEntry[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const left = a[i]
    const right = b[i]
    if (left.relativePath !== right.relativePath || left.kind !== right.kind) return false
    if (left.kind === "file") {
      if (!left.bytes || !right.bytes || !sameBytes(left.bytes, right.bytes)) return false
    }
  }
  return true
}

async function capturePathSnapshot(
  source: string,
  sourceKind: Exclude<ChangeTargetKind, "missing">,
): Promise<{ entries: PathSnapshotEntry[]; totalBytes: number }> {
  if (sourceKind === "file") {
    const stat = await FileManager.stat(source)
    if (stat.size > MAX_PATH_MUTATION_BYTES) {
      throw new Error(`path mutation source exceeds ${MAX_PATH_MUTATION_BYTES} byte safety limit`)
    }
    const bytes = await FileManager.readAsBytes(source)
    return { entries: [{ relativePath: "", kind: "file", bytes }], totalBytes: bytes.byteLength }
  }

  const entries: PathSnapshotEntry[] = []
  const queue: string[] = [source]
  let totalBytes = 0

  while (queue.length > 0) {
    const directory = queue.shift()
    if (!directory) break
    const children = await FileManager.readDirectory(directory, false)
    const normalized = children
      .map(entry => Path.normalize(Path.isAbsolute(entry) ? entry : Path.join(directory, entry)))
      .filter(candidate => pathInside(source, candidate) && candidate !== source)
      .sort((a, b) => a.localeCompare(b))

    for (const candidate of normalized) {
      if (entries.length >= MAX_PATH_MUTATION_ENTRIES) {
        throw new Error(`path mutation source exceeds ${MAX_PATH_MUTATION_ENTRIES} entry safety limit`)
      }
      if (await FileManager.isLink(candidate)) {
        throw new Error("symbolic links are not allowed inside move sources")
      }
      const relativePath = candidate.slice(source.length + 1)
      if (await FileManager.isDirectory(candidate)) {
        entries.push({ relativePath, kind: "directory", bytes: null })
        queue.push(candidate)
        continue
      }
      if (!(await FileManager.isFile(candidate))) {
        throw new Error("move source contains an unsupported filesystem entry")
      }
      const stat = await FileManager.stat(candidate)
      if (totalBytes + stat.size > MAX_PATH_MUTATION_BYTES) {
        throw new Error(`path mutation source exceeds ${MAX_PATH_MUTATION_BYTES} byte safety limit`)
      }
      const bytes = await FileManager.readAsBytes(candidate)
      totalBytes += bytes.byteLength
      entries.push({ relativePath, kind: "file", bytes })
    }
  }

  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  return { entries, totalBytes }
}

function zipU16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) throw new Error("invalid ZIP structure")
  return bytes[offset] + bytes[offset + 1] * 0x100
}

function zipU32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw new Error("invalid ZIP structure")
  return (
    bytes[offset] +
    bytes[offset + 1] * 0x100 +
    bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000
  ) >>> 0
}

function decodeZipName(bytes: Uint8Array): string {
  const data = Data.fromUint8Array(bytes)
  if (!data) throw new Error("ZIP filename decode failed")
  const decoded = data.toRawString("utf-8")
  if (decoded === null) throw new Error("ZIP filenames must be valid UTF-8")
  return decoded
}

function normalizeZipEntryName(name: string): { relativePath: string; isDirectory: boolean } {
  if (!name || name.includes("\0") || name.includes("\\")) throw new Error("ZIP contains an invalid entry path")
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) throw new Error("ZIP contains an absolute entry path")
  const isDirectory = name.endsWith("/")
  const trimmed = isDirectory ? name.slice(0, -1) : name
  if (!trimmed) throw new Error("ZIP contains an invalid root entry")
  const segments = trimmed.split("/")
  if (segments.some(segment => !segment || segment === "." || segment === "..")) {
    throw new Error("ZIP contains path traversal or empty path segments")
  }
  return { relativePath: segments.join("/"), isDirectory }
}

function inspectZipArchive(bytes: Uint8Array): { entries: ZipEntryInfo[]; totalUncompressedBytes: number } {
  if (bytes.byteLength < 22 || bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`ZIP size must be between 22 and ${MAX_ARCHIVE_BYTES} bytes`)
  }

  const minimum = Math.max(0, bytes.byteLength - 22 - 0xffff)
  let eocd = -1
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset--) {
    if (zipU32(bytes, offset) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new Error("ZIP end-of-central-directory record was not found")

  const diskNumber = zipU16(bytes, eocd + 4)
  const centralDisk = zipU16(bytes, eocd + 6)
  const entriesOnDisk = zipU16(bytes, eocd + 8)
  const entryCount = zipU16(bytes, eocd + 10)
  const centralSize = zipU32(bytes, eocd + 12)
  const centralOffset = zipU32(bytes, eocd + 16)
  const commentLength = zipU16(bytes, eocd + 20)

  if (eocd + 22 + commentLength > bytes.byteLength) throw new Error("ZIP comment extends beyond archive")
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error("multi-disk ZIP archives are not supported")
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 archives are not supported")
  }
  if (entryCount > MAX_ARCHIVE_ENTRIES) {
    throw new Error(`ZIP exceeds ${MAX_ARCHIVE_ENTRIES} entry safety limit`)
  }
  if (centralOffset + centralSize > eocd || centralOffset > bytes.byteLength) {
    throw new Error("ZIP central directory is out of bounds")
  }

  const entries: ZipEntryInfo[] = []
  const seen = new Set<string>()
  let totalUncompressedBytes = 0
  let cursor = centralOffset

  for (let i = 0; i < entryCount; i++) {
    if (zipU32(bytes, cursor) !== 0x02014b50) throw new Error("invalid ZIP central directory entry")
    const flags = zipU16(bytes, cursor + 8)
    const compressionMethod = zipU16(bytes, cursor + 10)
    const compressedSize = zipU32(bytes, cursor + 20)
    const uncompressedSize = zipU32(bytes, cursor + 24)
    const filenameLength = zipU16(bytes, cursor + 28)
    const extraLength = zipU16(bytes, cursor + 30)
    const commentLengthEntry = zipU16(bytes, cursor + 32)
    const externalAttributes = zipU32(bytes, cursor + 38)
    const localOffset = zipU32(bytes, cursor + 42)
    const end = cursor + 46 + filenameLength + extraLength + commentLengthEntry
    if (end > bytes.byteLength) throw new Error("ZIP central directory entry is truncated")
    if ((flags & 0x1) !== 0) throw new Error("encrypted ZIP entries are not supported")
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new Error(`unsupported ZIP compression method: ${compressionMethod}`)
    }
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error("ZIP64 entries are not supported")
    }

    const name = decodeZipName(bytes.slice(cursor + 46, cursor + 46 + filenameLength))
    const normalized = normalizeZipEntryName(name)
    if (seen.has(normalized.relativePath)) throw new Error("ZIP contains duplicate entry paths")
    seen.add(normalized.relativePath)

    const unixMode = (externalAttributes >>> 16) & 0xffff
    if ((unixMode & 0xf000) === 0xa000) throw new Error("ZIP symbolic-link entries are not allowed")

    if (!normalized.isDirectory) {
      totalUncompressedBytes += uncompressedSize
      if (totalUncompressedBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
        throw new Error(`ZIP exceeds ${MAX_ARCHIVE_UNCOMPRESSED_BYTES} byte uncompressed safety limit`)
      }
    }

    entries.push({
      relativePath: normalized.relativePath,
      isDirectory: normalized.isDirectory,
      uncompressedSize,
    })
    cursor = end
  }

  if (cursor > centralOffset + centralSize) throw new Error("ZIP central directory size mismatch")
  return { entries, totalUncompressedBytes }
}

function sha256Bytes(bytes: Uint8Array): string {
  const data = Data.fromUint8Array(bytes)
  if (!data) throw new Error("failed to construct Data for SHA-256")
  return Crypto.sha256(data).toHexString()
}

async function scriptingResourceReadPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const project = typeof args.project === "string" ? args.project : ""
  const relativePath = typeof args.path === "string" ? args.path : ""
  const { target } = await resolveExistingProjectTarget(project, relativePath)
  if (!(await FileManager.isFile(target))) throw new Error("resource path is not a regular file")
  const stat = await FileManager.stat(target)
  if (stat.size > MAX_READ_FILE_BYTES) {
    throw new Error(`resource exceeds ${MAX_READ_FILE_BYTES} byte read limit`)
  }
  const data = Data.fromFile(target)
  if (!data) throw new Error("failed to read resource file")
  const bytes = data.toUint8Array()
  if (!bytes) throw new Error("failed to read resource bytes")
  return {
    ok: true,
    project,
    path: relativePath,
    size_bytes: bytes.byteLength,
    sha256: sha256Bytes(bytes),
    content_base64: data.toBase64String(),
  }
}

async function scriptingResourceWritePreviewPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const project = typeof args.project === "string" ? args.project : ""
  const relativePath = typeof args.path === "string" ? args.path : ""
  const base64 = typeof args.content_base64 === "string" ? args.content_base64.trim() : ""
  const expectedHash = typeof args.sha256 === "string" ? args.sha256.trim().toLowerCase() : ""
  if (!base64 || base64.length > MAX_RESOURCE_BASE64_CHARS) {
    throw new Error(`content_base64 must be between 1 and ${MAX_RESOURCE_BASE64_CHARS} characters`)
  }
  if (expectedHash && !/^[0-9a-f]{64}$/.test(expectedHash)) {
    throw new Error("sha256 must be 64 hexadecimal characters")
  }
  const data = Data.fromBase64String(base64)
  if (!data) throw new Error("content_base64 is not valid Base64")
  const bytes = data.toUint8Array()
  if (!bytes) throw new Error("failed to decode resource bytes")
  if (bytes.byteLength > MAX_WRITE_FILE_BYTES) {
    throw new Error(`resource exceeds ${MAX_WRITE_FILE_BYTES} byte write limit`)
  }
  const newHash = sha256Bytes(bytes)
  if (expectedHash && newHash !== expectedHash) throw new Error("sha256 does not match decoded resource bytes")

  const { target } = await resolveMutationTarget(project, relativePath)
  const targetExists = await FileManager.exists(target)
  let oldBytes: Uint8Array | null = null
  let oldHash = ""
  let oldSize = 0
  if (targetExists) {
    if (await FileManager.isLink(target)) throw new Error("symbolic links are not allowed")
    if (!(await FileManager.isFile(target))) throw new Error("resource replace requires a regular file target")
    const stat = await FileManager.stat(target)
    if (stat.size > MAX_WRITE_FILE_BYTES) {
      throw new Error(`existing resource exceeds ${MAX_WRITE_FILE_BYTES} byte write limit`)
    }
    oldBytes = await FileManager.readAsBytes(target)
    oldSize = oldBytes.byteLength
    oldHash = sha256Bytes(oldBytes)
  }

  pruneChangePreviews()
  const previewId = newChangePreviewId()
  const createdAt = Date.now()
  const expiresAt = createdAt + CHANGE_PREVIEW_TTL_MS
  pendingChangePreviews.set(previewId, {
    previewId,
    operation: "resource_write",
    project,
    relativePath,
    destinationPath: null,
    content: null,
    expectedOriginal: null,
    expectedDeleteBytes: oldBytes,
    expectedPathSnapshot: null,
    targetKind: targetExists ? "file" : "missing",
    oldSizeBytes: oldSize,
    newSizeBytes: bytes.byteLength,
    createdAt,
    expiresAt,
    binaryContent: bytes,
  })
  return {
    ok: true,
    preview_id: previewId,
    operation: "resource_write",
    project,
    path: relativePath,
    target_exists: targetExists,
    old_size_bytes: oldSize,
    new_size_bytes: bytes.byteLength,
    old_sha256: oldHash,
    new_sha256: newHash,
    expires_at: new Date(expiresAt).toISOString(),
    summary: `${targetExists ? "replace" : "create"} resource ${project}/${relativePath} (${oldSize} -> ${bytes.byteLength} bytes)`,
  }
}

async function applyResourceWritePreview(
  previewId: string,
  preview: PendingChangePreview,
): Promise<Record<string, any>> {
  const { target } = await resolveMutationTarget(preview.project, preview.relativePath)
  const targetExists = await FileManager.exists(target)
  const expectedExists = preview.targetKind === "file"

  if (expectedExists) {
    if (!targetExists || (await FileManager.isLink(target)) || !(await FileManager.isFile(target))) {
      pendingChangePreviews.delete(previewId)
      throw new Error("resource_write preview is stale: target no longer matches")
    }
    const current = await FileManager.readAsBytes(target)
    if (!preview.expectedDeleteBytes || !sameBytes(current, preview.expectedDeleteBytes)) {
      pendingChangePreviews.delete(previewId)
      throw new Error("resource_write preview is stale: target bytes changed after preview")
    }
  } else if (targetExists) {
    pendingChangePreviews.delete(previewId)
    throw new Error("resource_write preview is stale: target now exists")
  }

  if (!preview.binaryContent) {
    pendingChangePreviews.delete(previewId)
    throw new Error("internal error: resource bytes are missing")
  }
  const bytes = preview.binaryContent
  pendingChangePreviews.delete(previewId)
  await FileManager.writeAsBytes(target, bytes)
  if (!(await FileManager.exists(target)) || (await FileManager.isLink(target)) || !(await FileManager.isFile(target))) {
    throw new Error("resource write verification failed: target is invalid")
  }
  const written = await FileManager.readAsBytes(target)
  if (!sameBytes(written, bytes)) throw new Error("resource write verification failed: content mismatch")
  return {
    ok: true,
    preview_id: previewId,
    operation: "resource_write",
    project: preview.project,
    path: preview.relativePath,
    size_bytes: written.byteLength,
    created: !expectedExists,
    replaced: expectedExists,
    directory_created: false,
    deleted: false,
    moved: false,
    copied: false,
    destination_path: "",
  }
}

function temporaryArchivePath(label: string, suffix: string): string {
  return Path.join(
    FileManager.temporaryDirectory,
    `ScriptingPlus_${label}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}${suffix}`,
  )
}

async function removeIfExists(path: string): Promise<void> {
  try {
    if (await FileManager.exists(path)) await FileManager.remove(path)
  } catch {}
}

async function scriptingZipPreviewPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const project = typeof args.project === "string" ? args.project : ""
  const relativePath = typeof args.path === "string" ? args.path : ""
  const destinationPath = typeof args.destination_path === "string" ? args.destination_path : ""
  const keepParent = args.keep_parent === undefined ? true : args.keep_parent === true
  if (!destinationPath.toLowerCase().endsWith(".zip")) throw new Error("destination_path must end with .zip")

  const { target } = await resolveMutationTarget(project, relativePath)
  if (!(await FileManager.exists(target))) throw new Error("zip requires an existing source")
  if (await FileManager.isLink(target)) throw new Error("symbolic links are not allowed")
  const targetKind: ChangeTargetKind = (await FileManager.isFile(target))
    ? "file"
    : (await FileManager.isDirectory(target)) ? "directory" : "missing"
  if (targetKind === "missing") throw new Error("zip source must be a regular file or directory")

  const destination = await resolveMutationTarget(project, destinationPath)
  if (destination.target === target) throw new Error("destination_path must differ from path")
  if (await FileManager.exists(destination.target)) throw new Error("zip destination already exists")
  if (targetKind === "directory" && pathInside(target, destination.target)) {
    throw new Error("ZIP destination cannot be inside the source directory")
  }

  const snapshot = await capturePathSnapshot(target, targetKind)
  pruneChangePreviews()
  const createdAt = Date.now()
  const preview: PendingChangePreview = {
    previewId: newChangePreviewId(),
    operation: "zip",
    project,
    relativePath,
    destinationPath,
    content: null,
    expectedOriginal: null,
    expectedDeleteBytes: null,
    expectedPathSnapshot: snapshot.entries,
    targetKind,
    oldSizeBytes: snapshot.totalBytes,
    newSizeBytes: 0,
    createdAt,
    expiresAt: createdAt + CHANGE_PREVIEW_TTL_MS,
    archiveKeepParent: keepParent,
    archiveEntries: null,
    archiveUncompressedBytes: snapshot.totalBytes,
  }
  pendingChangePreviews.set(preview.previewId, preview)
  return {
    ok: true,
    preview_id: preview.previewId,
    operation: preview.operation,
    project,
    path: relativePath,
    destination_path: destinationPath,
    target_exists: true,
    target_kind: targetKind,
    old_size_bytes: snapshot.totalBytes,
    new_size_bytes: 0,
    expires_at: new Date(preview.expiresAt).toISOString(),
    summary: `zip ${targetKind} ${project}/${relativePath} -> ${destinationPath}`,
  }
}

async function scriptingUnzipPreviewPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const project = typeof args.project === "string" ? args.project : ""
  const relativePath = typeof args.path === "string" ? args.path : ""
  const destinationPath = typeof args.destination_path === "string" ? args.destination_path : ""

  const { target } = await resolveMutationTarget(project, relativePath)
  if (!(await FileManager.exists(target)) || !(await FileManager.isFile(target)) || (await FileManager.isLink(target))) {
    throw new Error("unzip requires an existing regular ZIP file")
  }
  const stat = await FileManager.stat(target)
  if (stat.size > MAX_ARCHIVE_BYTES) throw new Error(`ZIP exceeds ${MAX_ARCHIVE_BYTES} byte safety limit`)
  const bytes = await FileManager.readAsBytes(target)
  const inspected = inspectZipArchive(bytes)

  const destination = await resolveMutationTarget(project, destinationPath)
  if (destination.target === target) throw new Error("destination_path must differ from path")
  if (await FileManager.exists(destination.target)) throw new Error("unzip destination already exists")

  pruneChangePreviews()
  const createdAt = Date.now()
  const preview: PendingChangePreview = {
    previewId: newChangePreviewId(),
    operation: "unzip",
    project,
    relativePath,
    destinationPath,
    content: null,
    expectedOriginal: null,
    expectedDeleteBytes: bytes,
    expectedPathSnapshot: null,
    targetKind: "file",
    oldSizeBytes: bytes.byteLength,
    newSizeBytes: inspected.totalUncompressedBytes,
    createdAt,
    expiresAt: createdAt + CHANGE_PREVIEW_TTL_MS,
    archiveKeepParent: false,
    archiveEntries: inspected.entries,
    archiveUncompressedBytes: inspected.totalUncompressedBytes,
  }
  pendingChangePreviews.set(preview.previewId, preview)
  return {
    ok: true,
    preview_id: preview.previewId,
    operation: preview.operation,
    project,
    path: relativePath,
    destination_path: destinationPath,
    target_exists: true,
    target_kind: "file",
    old_size_bytes: bytes.byteLength,
    new_size_bytes: inspected.totalUncompressedBytes,
    expires_at: new Date(preview.expiresAt).toISOString(),
    summary: `unzip ${project}/${relativePath} -> ${destinationPath} (${inspected.entries.length} entries)`,
  }
}

async function scriptingCompressedReplacePreviewPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const project = typeof args.project === "string" ? args.project : ""
  const relativePath = typeof args.path === "string" ? args.path : ""
  const archiveBase64 = typeof args.archive_base64 === "string" ? args.archive_base64.trim() : ""
  const expectedHash = typeof args.archive_sha256 === "string" ? args.archive_sha256.trim().toLowerCase() : ""
  if (!archiveBase64 || archiveBase64.length > MAX_COMPRESSED_REPLACE_BASE64_CHARS) {
    throw new Error(`archive_base64 must be between 1 and ${MAX_COMPRESSED_REPLACE_BASE64_CHARS} characters`)
  }
  if (expectedHash && !/^[0-9a-f]{64}$/.test(expectedHash)) throw new Error("archive_sha256 must be 64 lowercase/uppercase hex characters")

  if (relativePath === "@project") {
    const deploy = await scriptingProjectDeployPreviewPayload({
      project,
      archive_base64: archiveBase64,
      archive_sha256: expectedHash,
    })
    const oldSize = Number(deploy.old_size_bytes ?? 0)
    const newSize = Number(deploy.new_size_bytes ?? 0)
    const changed =
      Number(deploy.added_count ?? 0) +
      Number(deploy.modified_count ?? 0) +
      Number(deploy.deleted_count ?? 0)
    return {
      ok: true,
      preview_id: String(deploy.preview_id ?? ""),
      operation: "project_deploy",
      project,
      path: "@project",
      match_count: changed,
      old_size_bytes: oldSize,
      new_size_bytes: newSize,
      compressed_size_bytes: Number(deploy.archive_size_bytes ?? 0),
      uncompressed_size_bytes: newSize,
      archive_sha256: String(deploy.archive_sha256 ?? expectedHash),
      compression_ratio: Number(
        (Number(deploy.archive_size_bytes ?? 0) / Math.max(1, newSize)).toFixed(4),
      ),
      expires_at: String(deploy.expires_at ?? ""),
      summary: String(deploy.summary ?? `deploy ${project}`),
    }
  }

  const archiveData = Data.fromBase64String(archiveBase64)
  if (!archiveData) throw new Error("archive_base64 is not valid Base64")
  const archiveBytes = archiveData.toUint8Array()
  if (!archiveBytes) throw new Error("failed to decode ZIP bytes")
  const actualHash = sha256Bytes(archiveBytes)
  if (expectedHash && actualHash !== expectedHash) throw new Error("archive_sha256 does not match the decoded ZIP")

  const inspected = inspectZipArchive(archiveBytes)
  if (
    inspected.entries.length !== 1 ||
    inspected.entries[0].isDirectory ||
    inspected.entries[0].relativePath !== "payload"
  ) {
    throw new Error('compressed replace ZIP must contain exactly one regular file named "payload"')
  }
  if (inspected.totalUncompressedBytes > MAX_WRITE_FILE_BYTES) {
    throw new Error(`payload exceeds ${MAX_WRITE_FILE_BYTES} byte write limit`)
  }

  const zipPath = temporaryArchivePath("replace", ".zip")
  const stage = temporaryArchivePath("replace_stage", "")
  let content = ""
  try {
    await FileManager.writeAsBytes(zipPath, archiveBytes)
    await FileManager.createDirectory(stage, false)
    await FileManager.unzip(zipPath, stage)
    const snapshot = await capturePathSnapshot(stage, "directory")
    if (
      snapshot.entries.length !== 1 ||
      snapshot.entries[0].kind !== "file" ||
      snapshot.entries[0].relativePath !== "payload" ||
      !snapshot.entries[0].bytes
    ) {
      throw new Error("compressed replace extraction produced an unexpected filesystem layout")
    }
    const payloadPath = Path.join(stage, "payload")
    if ((await FileManager.isLink(payloadPath)) || !(await FileManager.isFile(payloadPath))) {
      throw new Error("compressed replace payload is not a regular file")
    }
    if (snapshot.entries[0].bytes.byteLength !== inspected.totalUncompressedBytes) {
      throw new Error("compressed replace payload size does not match ZIP metadata")
    }
    content = (await readStrictUtf8File(
      payloadPath,
      MAX_WRITE_FILE_BYTES,
      "compressed replace payload",
    )).text
  } finally {
    await removeIfExists(stage)
    await removeIfExists(zipPath)
  }

  const preview = await scriptingChangePreviewPayload({
    operation: "replace",
    project,
    path: relativePath,
    content,
  })
  const uncompressedSize = utf8ByteLength(content)
  const ratio = Number((archiveBytes.byteLength / Math.max(1, uncompressedSize)).toFixed(4))
  return {
    ok: true,
    preview_id: preview.preview_id,
    operation: "replace",
    project,
    path: relativePath,
    match_count: 1,
    old_size_bytes: preview.old_size_bytes,
    new_size_bytes: preview.new_size_bytes,
    compressed_size_bytes: archiveBytes.byteLength,
    uncompressed_size_bytes: uncompressedSize,
    archive_sha256: actualHash,
    compression_ratio: ratio,
    expires_at: preview.expires_at,
    summary: `compressed replace ${project}/${relativePath} (${archiveBytes.byteLength} -> ${uncompressedSize} bytes)`,
  }
}

async function applyArchivePreview(previewId: string, preview: PendingChangePreview): Promise<Record<string, any>> {
  const { target } = await resolveMutationTarget(preview.project, preview.relativePath)
  if (!(await FileManager.exists(target)) || (await FileManager.isLink(target))) {
    pendingChangePreviews.delete(previewId)
    throw new Error(`${preview.operation} preview is stale: source is missing or symbolic`)
  }

  const currentKind: ChangeTargetKind = (await FileManager.isFile(target))
    ? "file"
    : (await FileManager.isDirectory(target)) ? "directory" : "missing"
  if (currentKind !== preview.targetKind || currentKind === "missing") {
    pendingChangePreviews.delete(previewId)
    throw new Error(`${preview.operation} preview is stale: source type changed`)
  }
  if (!preview.destinationPath) {
    pendingChangePreviews.delete(previewId)
    throw new Error("internal error: archive destination is missing")
  }

  const destination = await resolveMutationTarget(preview.project, preview.destinationPath)
  if (await FileManager.exists(destination.target)) {
    pendingChangePreviews.delete(previewId)
    throw new Error(`${preview.operation} preview is stale: destination now exists`)
  }

  if (preview.operation === "zip") {
    if (!preview.expectedPathSnapshot) {
      pendingChangePreviews.delete(previewId)
      throw new Error("internal error: ZIP source snapshot is missing")
    }
    if (currentKind === "directory" && pathInside(target, destination.target)) {
      pendingChangePreviews.delete(previewId)
      throw new Error("zip preview is stale: destination is inside source directory")
    }
    const currentSnapshot = await capturePathSnapshot(target, currentKind)
    if (!samePathSnapshot(currentSnapshot.entries, preview.expectedPathSnapshot)) {
      pendingChangePreviews.delete(previewId)
      throw new Error("zip preview is stale: source changed after preview")
    }

    pendingChangePreviews.delete(previewId)
    try {
      await FileManager.zip(target, destination.target, preview.archiveKeepParent ?? true)
      if (
        !(await FileManager.exists(destination.target)) ||
        !(await FileManager.isFile(destination.target)) ||
        (await FileManager.isLink(destination.target))
      ) {
        throw new Error("ZIP creation verification failed")
      }
      const archiveBytes = await FileManager.readAsBytes(destination.target)
      inspectZipArchive(archiveBytes)
      return {
        ok: true, preview_id: previewId, operation: "zip", project: preview.project,
        path: preview.relativePath, size_bytes: archiveBytes.byteLength, created: false,
        replaced: false, directory_created: false, deleted: false, moved: false,
        copied: true, destination_path: preview.destinationPath,
      }
    } catch (error) {
      await removeIfExists(destination.target)
      throw error
    }
  }

  if (preview.operation !== "unzip" || !preview.expectedDeleteBytes) {
    pendingChangePreviews.delete(previewId)
    throw new Error("internal error: invalid archive preview state")
  }
  const currentBytes = await FileManager.readAsBytes(target)
  if (!sameBytes(currentBytes, preview.expectedDeleteBytes)) {
    pendingChangePreviews.delete(previewId)
    throw new Error("unzip preview is stale: ZIP content changed after preview")
  }
  const inspected = inspectZipArchive(currentBytes)
  if (inspected.totalUncompressedBytes !== (preview.archiveUncompressedBytes ?? -1)) {
    pendingChangePreviews.delete(previewId)
    throw new Error("unzip preview is stale: ZIP metadata changed after preview")
  }

  pendingChangePreviews.delete(previewId)
  const parent = Path.dirname(destination.target)
  const stage = Path.join(
    parent,
    `__ScriptingPlus_Unzip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
  )
  try {
    if (await FileManager.exists(stage)) throw new Error("unzip staging path collision")
    await FileManager.createDirectory(stage, false)
    await FileManager.unzip(target, stage)
    const staged = await capturePathSnapshot(stage, "directory")
    if (staged.totalBytes !== inspected.totalUncompressedBytes) {
      throw new Error("unzip verification failed: extracted size differs from ZIP metadata")
    }
    if (await FileManager.exists(destination.target)) throw new Error("unzip destination appeared before commit")
    await FileManager.rename(stage, destination.target)
    const extracted = await capturePathSnapshot(destination.target, "directory")
    if (!samePathSnapshot(staged.entries, extracted.entries)) {
      throw new Error("unzip verification failed after commit")
    }
    return {
      ok: true, preview_id: previewId, operation: "unzip", project: preview.project,
      path: preview.relativePath, size_bytes: extracted.totalBytes, created: false,
      replaced: false, directory_created: true, deleted: false, moved: false,
      copied: false, destination_path: preview.destinationPath,
    }
  } catch (error) {
    await removeIfExists(stage)
    throw error
  }
}

async function scriptingChangePreviewPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const operation =
    args.operation === "create" ||
    args.operation === "replace" ||
    args.operation === "create_directory" ||
    args.operation === "delete" ||
    args.operation === "move" ||
    args.operation === "copy_file"
      ? args.operation
      : ""
  const project = typeof args.project === "string" ? args.project : ""
  const relativePath = typeof args.path === "string" ? args.path : ""
  const destinationPath = typeof args.destination_path === "string" ? args.destination_path : null
  const content = typeof args.content === "string" ? args.content : null
  if (!operation) {
    throw new Error('operation must be "create", "replace", "create_directory", "delete", "move", or "copy_file"')
  }
  if ((operation === "create" || operation === "replace") && content === null) {
    throw new Error(`content must be a string for ${operation}`)
  }
  if (operation !== "create" && operation !== "replace" && args.content !== undefined) {
    throw new Error(`content is not accepted for ${operation}`)
  }
  if ((operation === "move" || operation === "copy_file") && !destinationPath) {
    throw new Error(`destination_path is required for ${operation}`)
  }
  if (operation !== "move" && operation !== "copy_file" && args.destination_path !== undefined) {
    throw new Error(`destination_path is not accepted for ${operation}`)
  }

  let newSizeBytes = content === null ? 0 : utf8ByteLength(content)
  if (newSizeBytes > MAX_WRITE_FILE_BYTES) {
    throw new Error(`content exceeds ${MAX_WRITE_FILE_BYTES} byte write limit`)
  }

  const { target } = await resolveMutationTarget(project, relativePath)
  const targetExists = await FileManager.exists(target)
  let expectedOriginal: string | null = null
  let expectedDeleteBytes: Uint8Array | null = null
  let expectedPathSnapshot: PathSnapshotEntry[] | null = null
  let targetKind: ChangeTargetKind = "missing"
  let oldSizeBytes = 0

  if (targetExists) {
    if (await FileManager.isLink(target)) throw new Error("symbolic links are not allowed")
    if (await FileManager.isFile(target)) targetKind = "file"
    else if (await FileManager.isDirectory(target)) targetKind = "directory"
    else throw new Error("target must be a regular file or directory")
    const stat = await FileManager.stat(target)
    oldSizeBytes = stat.size
  }

  if (operation === "create") {
    if (targetExists) throw new Error("create requires a target path that does not already exist")
  } else if (operation === "replace") {
    if (!targetExists || targetKind !== "file") throw new Error("replace requires an existing target file")
    const utf8 = await readStrictUtf8File(target, MAX_WRITE_FILE_BYTES, "existing file")
    expectedOriginal = utf8.text
    oldSizeBytes = utf8.sizeBytes
  } else if (operation === "create_directory") {
    if (targetExists) throw new Error("create_directory requires a target path that does not already exist")
  } else if (operation === "delete") {
    if (!targetExists) throw new Error("delete requires an existing target")
    if (targetKind === "directory") {
      const entries = await FileManager.readDirectory(target, false)
      if (entries.length !== 0) {
        throw new Error("delete refuses non-empty directories; remove their contents explicitly first")
      }
    } else {
      if (oldSizeBytes > MAX_DELETE_FILE_BYTES) {
        throw new Error(`delete target exceeds ${MAX_DELETE_FILE_BYTES} byte safety limit`)
      }
      expectedDeleteBytes = await FileManager.readAsBytes(target)
      oldSizeBytes = expectedDeleteBytes.byteLength
    }
  } else {
    if (!targetExists || targetKind === "missing") throw new Error(`${operation} requires an existing source`)
    if (operation === "copy_file" && targetKind !== "file") {
      throw new Error("copy_file requires an existing source file")
    }
    const destination = await resolveMutationTarget(project, destinationPath as string)
    if (destination.target === target) throw new Error("destination_path must differ from path")
    if (await FileManager.exists(destination.target)) {
      throw new Error(`${operation} requires a destination path that does not already exist`)
    }
    if (targetKind === "directory" && pathInside(target, destination.target)) {
      throw new Error("move destination cannot be inside the source directory")
    }
    const snapshot = await capturePathSnapshot(target, targetKind)
    expectedPathSnapshot = snapshot.entries
    oldSizeBytes = snapshot.totalBytes
    newSizeBytes = operation === "copy_file" ? snapshot.totalBytes : 0
  }

  pruneChangePreviews()
  const previewId = newChangePreviewId()
  const createdAt = Date.now()
  const expiresAt = createdAt + CHANGE_PREVIEW_TTL_MS
  pendingChangePreviews.set(previewId, {
    previewId,
    operation,
    project,
    relativePath,
    destinationPath,
    content,
    expectedOriginal,
    expectedDeleteBytes,
    expectedPathSnapshot,
    targetKind,
    oldSizeBytes,
    newSizeBytes,
    createdAt,
    expiresAt,
  })

  let summary = ""
  if (operation === "create") summary = `create ${project}/${relativePath} (${newSizeBytes} bytes)`
  else if (operation === "replace") summary = `replace ${project}/${relativePath} (${oldSizeBytes} -> ${newSizeBytes} bytes)`
  else if (operation === "create_directory") summary = `create directory ${project}/${relativePath}`
  else if (operation === "delete") summary = `delete ${targetKind} ${project}/${relativePath}`
  else if (operation === "move") summary = `move ${targetKind} ${project}/${relativePath} -> ${destinationPath}`
  else summary = `copy file ${project}/${relativePath} -> ${destinationPath} (${newSizeBytes} bytes)`

  return {
    ok: true,
    preview_id: previewId,
    operation,
    project,
    path: relativePath,
    destination_path: destinationPath ?? "",
    target_exists: targetExists,
    target_kind: targetKind,
    old_size_bytes: oldSizeBytes,
    new_size_bytes: newSizeBytes,
    expires_at: new Date(expiresAt).toISOString(),
    summary,
  }
}

async function scriptingChangeApplyPayload(args: Record<string, any>): Promise<Record<string, any>> {
  const previewId = typeof args.preview_id === "string" ? args.preview_id : ""
  if (!previewId) throw new Error("preview_id is required")
  pruneChangePreviews()
  const preview = pendingChangePreviews.get(previewId)
  if (!preview) throw new Error("preview not found or expired; create a new preview")
  if (preview.expiresAt <= Date.now()) {
    pendingChangePreviews.delete(previewId)
    throw new Error("preview expired; create a new preview")
  }

  if (
    preview.operation === "create_project" ||
    preview.operation === "clone_project" ||
    preview.operation === "delete_project"
  ) {
    return await applyProjectPreview(previewId, preview)
  }

  if (preview.operation === "zip" || preview.operation === "unzip") {
    return await applyArchivePreview(previewId, preview)
  }

  if (preview.operation === "github_put" || preview.operation === "github_delete") {
    return await applyGitHubPreview(previewId, preview)
  }

  if (preview.operation === "github_queue") {
    return await applyGitHubQueuePreview(previewId, preview)
  }

  if (preview.operation === "project_deploy") {
    return await applyProjectDeployPreview(previewId, preview)
  }

  const { target } = await resolveMutationTarget(preview.project, preview.relativePath)
  const targetExists = await FileManager.exists(target)
  let destination = ""

  if (preview.operation === "create" || preview.operation === "create_directory") {
    if (targetExists) {
      pendingChangePreviews.delete(previewId)
      throw new Error(`${preview.operation} preview is stale: target now exists`)
    }
  } else {
    if (!targetExists) {
      pendingChangePreviews.delete(previewId)
      throw new Error(`${preview.operation} preview is stale: target no longer exists`)
    }
    if (await FileManager.isLink(target)) {
      pendingChangePreviews.delete(previewId)
      throw new Error("symbolic links are not allowed")
    }

    const currentKind: ChangeTargetKind = (await FileManager.isFile(target))
      ? "file"
      : (await FileManager.isDirectory(target))
        ? "directory"
        : "missing"
    if (currentKind !== preview.targetKind || currentKind === "missing") {
      pendingChangePreviews.delete(previewId)
      throw new Error(`${preview.operation} preview is stale: target type changed after preview`)
    }

    if (preview.operation === "replace") {
      if (currentKind !== "file") {
        pendingChangePreviews.delete(previewId)
        throw new Error("replace preview is stale: target is no longer a file")
      }
      const current = (await readStrictUtf8File(
        target,
        MAX_WRITE_FILE_BYTES,
        "replace target",
      )).text
      if (current !== preview.expectedOriginal) {
        pendingChangePreviews.delete(previewId)
        throw new Error("replace preview is stale: file content changed after preview")
      }
    } else if (preview.operation === "delete") {
      if (currentKind === "directory") {
        const entries = await FileManager.readDirectory(target, false)
        if (entries.length !== 0) {
          pendingChangePreviews.delete(previewId)
          throw new Error("delete preview is stale: directory is no longer empty")
        }
      } else {
        const currentStat = await FileManager.stat(target)
        if (currentStat.size > MAX_DELETE_FILE_BYTES) {
          pendingChangePreviews.delete(previewId)
          throw new Error("delete preview is stale: file now exceeds the delete safety limit")
        }
        const currentBytes = await FileManager.readAsBytes(target)
        if (!preview.expectedDeleteBytes || !sameBytes(currentBytes, preview.expectedDeleteBytes)) {
          pendingChangePreviews.delete(previewId)
          throw new Error("delete preview is stale: file content changed after preview")
        }
      }
    } else {
      if (!preview.destinationPath || !preview.expectedPathSnapshot) {
        pendingChangePreviews.delete(previewId)
        throw new Error("internal error: missing path mutation preview state")
      }
      const destinationResolved = await resolveMutationTarget(preview.project, preview.destinationPath)
      destination = destinationResolved.target
      if (destination === target || (currentKind === "directory" && pathInside(target, destination))) {
        pendingChangePreviews.delete(previewId)
        throw new Error(`${preview.operation} preview is stale: destination is no longer valid`)
      }
      if (await FileManager.exists(destination)) {
        pendingChangePreviews.delete(previewId)
        throw new Error(`${preview.operation} preview is stale: destination now exists`)
      }
      if (preview.operation === "copy_file" && currentKind !== "file") {
        pendingChangePreviews.delete(previewId)
        throw new Error("copy_file preview is stale: source is no longer a file")
      }
      const currentSnapshot = await capturePathSnapshot(target, currentKind)
      if (!samePathSnapshot(currentSnapshot.entries, preview.expectedPathSnapshot)) {
        pendingChangePreviews.delete(previewId)
        throw new Error(`${preview.operation} preview is stale: source changed after preview`)
      }
    }
  }

  pendingChangePreviews.delete(previewId)

  if (preview.operation === "create" || preview.operation === "replace") {
    if (preview.content === null) throw new Error("internal error: missing write content")
    await FileManager.writeAsString(target, preview.content)
    if (!(await FileManager.exists(target))) throw new Error("write verification failed: target does not exist")
    if (await FileManager.isLink(target)) throw new Error("write verification failed: target became a symbolic link")
    if (!(await FileManager.isFile(target))) throw new Error("write verification failed: target is not a file")
    const written = await FileManager.readAsString(target)
    if (written !== preview.content) throw new Error("write verification failed: content mismatch")
    const stat = await FileManager.stat(target)
    return {
      ok: true, preview_id: previewId, operation: preview.operation, project: preview.project,
      path: preview.relativePath, size_bytes: stat.size, created: preview.operation === "create",
      replaced: preview.operation === "replace", directory_created: false, deleted: false,
      moved: false, copied: false, destination_path: "",
    }
  }

  if (preview.operation === "create_directory") {
    await FileManager.createDirectory(target, false)
    if (!(await FileManager.exists(target)) || !(await FileManager.isDirectory(target)) || (await FileManager.isLink(target))) {
      throw new Error("directory creation verification failed")
    }
    return {
      ok: true, preview_id: previewId, operation: preview.operation, project: preview.project,
      path: preview.relativePath, size_bytes: 0, created: false, replaced: false,
      directory_created: true, deleted: false, moved: false, copied: false, destination_path: "",
    }
  }

  if (preview.operation === "delete") {
    await FileManager.remove(target)
    if (await FileManager.exists(target)) throw new Error("delete verification failed: target still exists")
    return {
      ok: true, preview_id: previewId, operation: preview.operation, project: preview.project,
      path: preview.relativePath, size_bytes: preview.oldSizeBytes, created: false, replaced: false,
      directory_created: false, deleted: true, moved: false, copied: false, destination_path: "",
    }
  }

  if (!destination || !preview.expectedPathSnapshot) {
    throw new Error("internal error: missing path mutation destination")
  }

  if (preview.operation === "move") {
    await FileManager.rename(target, destination)
    if (await FileManager.exists(target)) throw new Error("move verification failed: source still exists")
    if (!(await FileManager.exists(destination)) || (await FileManager.isLink(destination))) {
      throw new Error("move verification failed: destination is missing or symbolic")
    }
    const destinationKind: ChangeTargetKind = (await FileManager.isFile(destination))
      ? "file"
      : (await FileManager.isDirectory(destination)) ? "directory" : "missing"
    if (destinationKind !== preview.targetKind || destinationKind === "missing") {
      throw new Error("move verification failed: destination type mismatch")
    }
    const movedSnapshot = await capturePathSnapshot(destination, destinationKind)
    if (!samePathSnapshot(movedSnapshot.entries, preview.expectedPathSnapshot)) {
      throw new Error("move verification failed: destination content mismatch")
    }
    return {
      ok: true, preview_id: previewId, operation: preview.operation, project: preview.project,
      path: preview.relativePath, size_bytes: preview.oldSizeBytes, created: false, replaced: false,
      directory_created: false, deleted: false, moved: true, copied: false,
      destination_path: preview.destinationPath ?? "",
    }
  }

  await FileManager.copyFile(target, destination)
  if (!(await FileManager.exists(target)) || !(await FileManager.isFile(target))) {
    throw new Error("copy verification failed: source file changed or disappeared")
  }
  if (!(await FileManager.exists(destination)) || !(await FileManager.isFile(destination)) || (await FileManager.isLink(destination))) {
    throw new Error("copy verification failed: destination file is missing or invalid")
  }
  const sourceSnapshot = await capturePathSnapshot(target, "file")
  const copiedSnapshot = await capturePathSnapshot(destination, "file")
  if (!samePathSnapshot(sourceSnapshot.entries, preview.expectedPathSnapshot) ||
      !samePathSnapshot(copiedSnapshot.entries, preview.expectedPathSnapshot)) {
    throw new Error("copy verification failed: content mismatch")
  }
  return {
    ok: true, preview_id: previewId, operation: preview.operation, project: preview.project,
    path: preview.relativePath, size_bytes: preview.oldSizeBytes, created: false, replaced: false,
    directory_created: false, deleted: false, moved: false, copied: true,
    destination_path: preview.destinationPath ?? "",
  }
}

async function dispatchMcp(
  message: JsonRpcMessage,
  headers: Record<string, string[]> | undefined,
): Promise<DispatchResult> {
  const method = message.method ?? ""
  const hasId = Object.prototype.hasOwnProperty.call(message, "id")
  const id = requestId(message)

  // JSON-RPC notifications have no id. MCP's HTTP transport returns 202 for them;
  // the Tunnel represents that terminal transport acknowledgement as notify_ack.
  if (!hasId) {
    return { kind: "ack", code: 202, modern: false }
  }

  const modern = isModernCandidate(message, headers)
  if (modern) {
    const validationError = validateModernRequest(message, headers)
    if (validationError) return validationError
  }

  if (id === undefined) {
    return {
      kind: "response",
      code: 400,
      modern,
      json: jsonRpcError(undefined, -32600, "Invalid Request: id must be a string or number"),
    }
  }

  if (method === "server/discover") {
    return {
      kind: "response",
      code: 200,
      modern: true,
      json: jsonRpcResult(
        id,
        modernCompleteResult({
          ttlMs: 0,
          cacheScope: "public",
          supportedVersions: [MCP_MODERN_VERSION, ...MCP_LEGACY_VERSIONS],
          capabilities: { tools: { listChanged: true } },
        }),
      ),
    }
  }

  if (method === "initialize") {
    return {
      kind: "response",
      code: 200,
      modern: false,
      json: jsonRpcResult(id, {
        protocolVersion: chooseLegacyVersion(message),
        capabilities: { tools: { listChanged: true } },
        serverInfo: {
          name: CLIENT_NAME,
          version: VERSION,
        },
      }),
    }
  }

  if (method === "tools/list") {
    // Compatibility surface: keep the published tool inventory aligned with
    // the existing ChatGPT snapshot. New 1.3.x capabilities stay implemented
    // internally until the account can safely rescan/update MCP actions.
    const tools = [
      SCRIPTING_STATUS_TOOL,
      SCRIPTING_PROJECTS_TOOL,
      SCRIPTING_READ_TOOL,
      SCRIPTING_TREE_TOOL,
      SCRIPTING_SEARCH_TOOL,
      SCRIPTING_EDIT_TOOL,
      SCRIPTING_RUN_TOOL,
      SCRIPTING_VALIDATE_TOOL,
      SCRIPTING_HASH_TOOL,
      SCRIPTING_PROJECT_CREATE_PREVIEW_TOOL,
      SCRIPTING_PROJECT_CLONE_PREVIEW_TOOL,
      SCRIPTING_PROJECT_DELETE_PREVIEW_TOOL,
      SCRIPTING_CHANGE_PREVIEW_TOOL,
      SCRIPTING_MOVE_PREVIEW_TOOL,
      SCRIPTING_COPY_FILE_PREVIEW_TOOL,
      SCRIPTING_ZIP_PREVIEW_TOOL,
      SCRIPTING_UNZIP_PREVIEW_TOOL,
      SCRIPTING_COMPRESSED_REPLACE_PREVIEW_TOOL,
      SCRIPTING_CHANGE_APPLY_TOOL,
    ]
    const result = modern
      ? modernCompleteResult({ ttlMs: 0, cacheScope: "public", tools })
      : { tools }
    return { kind: "response", code: 200, modern, json: jsonRpcResult(id, result) }
  }

  if (method === "tools/call") {
    const params = message.params
    const toolName = isPlainObject(params) && typeof params.name === "string" ? params.name : ""
    const args = isPlainObject(params) && isPlainObject(params.arguments) ? params.arguments : null

    if (!toolName || !args) {
      return {
        kind: "response",
        code: 400,
        modern,
        json: jsonRpcError(id, -32602, "Invalid params: tools/call requires name and object arguments"),
      }
    }

    if (toolName === SCRIPTING_STATUS_TOOL.name) {
      if (Object.keys(args).length !== 0) {
        return {
          kind: "response",
          code: 400,
          modern,
          json: jsonRpcError(id, -32602, "Invalid params: scripting_status accepts no arguments"),
        }
      }
      return {
        kind: "response",
        code: 200,
        modern,
        json: jsonRpcResult(id, toolCallResult(scriptingStatusPayload(), modern)),
      }
    }

    if (toolName === SCRIPTING_PROJECTS_TOOL.name) {
      if (Object.keys(args).length !== 0) {
        return {
          kind: "response",
          code: 400,
          modern,
          json: jsonRpcError(id, -32602, "Invalid params: scripting_projects accepts no arguments"),
        }
      }
      try {
        const payload = await scriptingProjectsPayload()
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolCallResult(payload, modern)),
        }
      } catch (error) {
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolErrorResult(`scripting_projects failed: ${safeError(error)}`, modern)),
        }
      }
    }

    if (toolName === SCRIPTING_READ_TOOL.name) {
      try {
        const payload = await scriptingReadPayload(args)
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolCallResult(payload, modern)),
        }
      } catch (error) {
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolErrorResult(`scripting_read failed: ${safeError(error)}`, modern)),
        }
      }
    }

    if (toolName === SCRIPTING_TREE_TOOL.name) {
      try {
        const payload = await scriptingTreePayload(args)
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolCallResult(payload, modern)),
        }
      } catch (error) {
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolErrorResult(`scripting_tree failed: ${safeError(error)}`, modern)),
        }
      }
    }

    if (toolName === SCRIPTING_SEARCH_TOOL.name) {
      try {
        const payload = await scriptingSearchPayload(args)
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolCallResult(payload, modern)),
        }
      } catch (error) {
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolErrorResult(`scripting_search failed: ${safeError(error)}`, modern)),
        }
      }
    }

    if (toolName === SCRIPTING_EDIT_TOOL.name) {
      try {
        const payload = await scriptingEditPayload(args)
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolCallResult(payload, modern)),
        }
      } catch (error) {
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolErrorResult(`scripting_edit failed: ${safeError(error)}`, modern)),
        }
      }
    }

    if (toolName === SCRIPTING_RUN_TOOL.name) {
      try {
        const payload = await scriptingRunPayload(args)
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolCallResult(payload, modern)),
        }
      } catch (error) {
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolErrorResult(`scripting_run failed: ${safeError(error)}`, modern)),
        }
      }
    }

    if (toolName === SCRIPTING_VALIDATE_TOOL.name) {
      try {
        const payload = await scriptingValidatePayload(args)
        return {
          kind: "response", code: 200, modern,
          json: jsonRpcResult(id, toolCallResult(payload, modern)),
        }
      } catch (error) {
        return {
          kind: "response", code: 200, modern,
          json: jsonRpcResult(id, toolErrorResult(`scripting_validate failed: ${safeError(error)}`, modern)),
        }
      }
    }

    if (toolName === SCRIPTING_HASH_TOOL.name) {
      try {
        const payload = await scriptingHashPayload(args)
        return {
          kind: "response", code: 200, modern,
          json: jsonRpcResult(id, toolCallResult(payload, modern)),
        }
      } catch (error) {
        return {
          kind: "response", code: 200, modern,
          json: jsonRpcResult(id, toolErrorResult(`scripting_hash failed: ${safeError(error)}`, modern)),
        }
      }
    }

    if (toolName === SCRIPTING_CHANGE_PREVIEW_TOOL.name) {
      try {
        const payload = await scriptingChangePreviewPayload(args)
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolCallResult(payload, modern)),
        }
      } catch (error) {
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolErrorResult(`scripting_change_preview failed: ${safeError(error)}`, modern)),
        }
      }
    }

    if (toolName === SCRIPTING_MOVE_PREVIEW_TOOL.name) {
      try {
        const payload = await scriptingChangePreviewPayload({
          operation: "move",
          project: args.project,
          path: args.path,
          destination_path: args.destination_path,
        })
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolCallResult(payload, modern)),
        }
      } catch (error) {
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolErrorResult(`scripting_move_preview failed: ${safeError(error)}`, modern)),
        }
      }
    }

    if (toolName === SCRIPTING_COPY_FILE_PREVIEW_TOOL.name) {
      try {
        const payload = await scriptingChangePreviewPayload({
          operation: "copy_file",
          project: args.project,
          path: args.path,
          destination_path: args.destination_path,
        })
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolCallResult(payload, modern)),
        }
      } catch (error) {
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolErrorResult(`scripting_copy_file_preview failed: ${safeError(error)}`, modern)),
        }
      }
    }

    if (toolName === SCRIPTING_ZIP_PREVIEW_TOOL.name) {
      try {
        const payload = await scriptingZipPreviewPayload(args)
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolCallResult(payload, modern)),
        }
      } catch (error) {
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolErrorResult(`scripting_zip_preview failed: ${safeError(error)}`, modern)),
        }
      }
    }

    if (toolName === SCRIPTING_UNZIP_PREVIEW_TOOL.name) {
      try {
        const payload = await scriptingUnzipPreviewPayload(args)
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolCallResult(payload, modern)),
        }
      } catch (error) {
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolErrorResult(`scripting_unzip_preview failed: ${safeError(error)}`, modern)),
        }
      }
    }

    if (toolName === SCRIPTING_COMPRESSED_REPLACE_PREVIEW_TOOL.name) {
      try {
        const payload = await scriptingCompressedReplacePreviewPayload(args)
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolCallResult(payload, modern)),
        }
      } catch (error) {
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolErrorResult(`scripting_compressed_replace_preview failed: ${safeError(error)}`, modern)),
        }
      }
    }

    if (toolName === SCRIPTING_CHANGE_APPLY_TOOL.name) {
      try {
        const raw = await scriptingChangeApplyPayload(args)
        const payload = {
          ok: raw.ok === true,
          preview_id: typeof raw.preview_id === "string" ? raw.preview_id : "",
          operation: typeof raw.operation === "string" ? raw.operation : "",
          project: typeof raw.project === "string" ? raw.project : "",
          path: typeof raw.path === "string" ? raw.path : "",
          size_bytes: Number.isInteger(raw.size_bytes) ? raw.size_bytes : 0,
          created: raw.created === true,
          replaced: raw.replaced === true,
          directory_created: raw.directory_created === true,
          deleted: raw.deleted === true,
          moved: raw.moved === true,
          copied: raw.copied === true,
          destination_path: typeof raw.destination_path === "string" ? raw.destination_path : "",
        }
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolCallResult(payload, modern)),
        }
      } catch (error) {
        return {
          kind: "response",
          code: 200,
          modern,
          json: jsonRpcResult(id, toolErrorResult(`scripting_change_apply failed: ${safeError(error)}`, modern)),
        }
      }
    }

    return {
      kind: "response",
      code: 404,
      modern,
      json: jsonRpcError(id, -32602, `Unknown tool: ${toolName}`),
    }
  }

  if (method === "ping") {
    // ping exists in the legacy era but was removed in MCP 2026-07-28.
    if (modern) {
      return {
        kind: "response",
        code: 404,
        modern: true,
        json: jsonRpcError(id, -32601, "Method not found"),
      }
    }
    return { kind: "response", code: 200, modern: false, json: jsonRpcResult(id, {}) }
  }

  return {
    kind: "response",
    code: modern ? 404 : 200,
    modern,
    json: jsonRpcError(id, -32601, "Method not found"),
  }
}

function monotonicNowMs(): number | null {
  const performanceObject = (globalThis as any).performance
  if (!performanceObject || typeof performanceObject.now !== "function") return null
  const value = performanceObject.now()
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function parseResponseTimeoutMs(value: unknown): number | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "string" || value.length > 32) return null

  const match = /^([0-9]+)(ns|us|ms|s|m|h)$/.exec(value)
  if (!match) return null

  try {
    const amount = BigInt(match[1])
    const unit = match[2]
    const nanosecondsPerUnit: Record<string, bigint> = {
      ns: 1n,
      us: 1_000n,
      ms: 1_000_000n,
      s: 1_000_000_000n,
      m: 60_000_000_000n,
      h: 3_600_000_000_000n,
    }
    const totalNs = amount * nanosecondsPerUnit[unit]
    const maxSafeNs = BigInt(Number.MAX_SAFE_INTEGER) * 1_000_000n
    if (totalNs > maxSafeNs) return null
    return Number(totalNs) / 1_000_000
  } catch {
    return null
  }
}

function commandDeadlineMs(command: TunnelCommand, receiptMs: number | null): number | null {
  const durationMs = parseResponseTimeoutMs(command.response_timeout)
  if (durationMs === null || receiptMs === null) return null
  return receiptMs + durationMs
}

function deadlineExpired(deadlineMs: number | null): boolean {
  if (deadlineMs === null) return false
  const now = monotonicNowMs()
  return now !== null && now >= deadlineMs
}

function remainingDeadlineMs(deadlineMs: number | null): number | null {
  if (deadlineMs === null) return null
  const now = monotonicNowMs()
  if (now === null) return null
  return Math.max(0, deadlineMs - now)
}


type RoutingCorrection = { token: string; revision: number }

function validRoutingToken(token: string): boolean {
  if (!token || token.length > 4096 || token.includes(",")) return false
  for (let i = 0; i < token.length; i++) {
    const code = token.charCodeAt(i)
    if (code < 0x21 || code > 0x7e) return false
  }
  return true
}

function parseRoutingCorrection(response: any, rawBody: string): RoutingCorrection | null {
  if (response?.status !== 409) return null
  let parsed: any
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return null
  }
  const error = parsed?.error
  if (!isPlainObject(error) || error.code !== "wrong_cluster") return null

  const token = response?.headers?.get?.("X-Tunnel-Shard-Token")
  if (typeof token !== "string" || !validRoutingToken(token)) return null
  if (Object.prototype.hasOwnProperty.call(error, "shard_token") && error.shard_token !== token) return null

  const revision = error.policy_revision
  if (!Number.isSafeInteger(revision) || revision < 0) return null
  return { token, revision }
}

function applyRoutingCorrection(correction: RoutingCorrection): void {
  routingState.failures = 0
  routingState.corrections += 1

  if (!routingState.known || correction.revision > routingState.revision) {
    routingState.known = true
    routingState.revision = correction.revision
    routingState.acceptedToken = correction.token
    routingState.token = correction.token
  } else if (correction.revision === routingState.revision) {
    routingState.token = correction.token === routingState.acceptedToken ? correction.token : ""
  }

  if (routingState.corrections >= MAX_ROUTING_FAILURES) {
    routingState.token = ""
    routingState.corrections = 0
  }
}

function recordPollAvailable(): void {
  routingState.failures = 0
  routingState.corrections = 0
}

function recordPollDestinationFailure(attemptToken: string): void {
  if (!attemptToken || routingState.token !== attemptToken) return
  routingState.failures += 1
  if (routingState.failures >= MAX_ROUTING_FAILURES) {
    routingState.token = ""
    routingState.failures = 0
  }
}

function pollHeaders(apiKey: string): Record<string, string> {
  const headers = commonHeaders(apiKey)
  if (routingState.token) headers["X-Tunnel-Shard-Token"] = routingState.token
  return headers
}

function pollURL(tunnelId: string, timeoutMs: number): string {
  return `${API_BASE}/v1/tunnels/${encodeURIComponent(tunnelId)}/poll?limit=${POLL_LIMIT}&timeout_ms=${timeoutMs}`
}

function tunnelServiceRequestID(response: any): string | null {
  try {
    const value = response?.headers?.get?.("X-Request-Id")
    return typeof value === "string" && value.length > 0 ? value : null
  } catch {
    return null
  }
}

function retryAfterMs(response: any): number | null {
  try {
    const raw = response?.headers?.get?.("Retry-After")
    if (typeof raw !== "string" || !raw.trim()) return null
    const value = raw.trim()
    if (/^[0-9]+$/.test(value)) return Number(value) * 1000
    const at = Date.parse(value)
    if (!Number.isFinite(at)) return null
    return Math.max(0, at - Date.now())
  } catch {
    return null
  }
}

async function retryDelay(
  baseMs: number,
  response: any,
  deadlineMs: number | null,
): Promise<boolean> {
  const serverDelay = retryAfterMs(response) ?? 0
  const delay = Math.max(baseMs, serverDelay)
  const remaining = remainingDeadlineMs(deadlineMs)
  if (remaining !== null && delay >= remaining) return false
  await sleep(delay)
  return true
}

type PostOutcome = "sent" | "expired" | "failed"

async function postTunnelResponse(
  config: { tunnelId: string; apiKey: string },
  command: TunnelCommand,
  responseBody: Record<string, any>,
  deadlineMs: number | null,
  controlPlaneRequestID: string | null,
): Promise<PostOutcome> {
  const url = `${API_BASE}/v1/tunnels/${encodeURIComponent(config.tunnelId)}/response`
  const body = JSON.stringify(responseBody)

  for (let attempt = 1; attempt <= 3 && running; attempt++) {
    if (deadlineExpired(deadlineMs)) {
      log(`response ${command.request_id}: deadline 已过，按 Tunnel 协议丢弃`)
      return "expired"
    }

    const remaining = remainingDeadlineMs(deadlineMs)
    if (remaining !== null && remaining <= 0) return "expired"

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...commonHeaders(config.apiKey),
          "Content-Type": "application/json",
          "X-Tunnel-Shard-Token": command.shard_token,
          ...(controlPlaneRequestID ? { "X-Client-Request-Id": controlPlaneRequestID } : {}),
        },
        body,
        timeout: remaining === null ? 15 : Math.max(0.1, Math.min(15, remaining / 1000)),
        debugLabel: "Tunnel response",
      })
      // The native Scripting fetch timeout bounds the request to the remaining
      // Tunnel response deadline. Re-check after the request before accepting it.
      if (deadlineExpired(deadlineMs)) {
        log(`response ${command.request_id}: response 到达时已过 deadline，丢弃`)
        return "expired"
      }

      if (response.status === 200) return "sent"

      // 404 means the pending command has already been fulfilled/expired.
      if (response.status === 404) {
        log(`response ${command.request_id}: 404，按终态处理`)
        return "sent"
      }

      if (response.status === 401 || response.status === 403) {
        log(`response ${command.request_id}: ${response.status} 鉴权失败`)
        running = false
        return "failed"
      }

      const retryable = [408, 429, 502, 503, 504].includes(response.status)
      if (!retryable || attempt === 3) {
        log(`response ${command.request_id}: HTTP ${response.status}`)
        return "failed"
      }

      const canRetry = await retryDelay(500 * attempt, response, deadlineMs)
      if (!canRetry) {
        log(`response ${command.request_id}: 重试将越过 deadline，丢弃`)
        return "expired"
      }
      continue
    } catch (error) {
      if (!running) return "failed"
      if (deadlineExpired(deadlineMs)) {
        log(`response ${command.request_id}: deadline 已过，丢弃`)
        return "expired"
      }
      if (attempt === 3) {
        log(`response ${command.request_id}: ${safeError(error)}`)
        return "failed"
      }
    }

    const remainingAfterError = remainingDeadlineMs(deadlineMs)
    const delay = 500 * attempt
    if (remainingAfterError !== null && delay >= remainingAfterError) {
      log(`response ${command.request_id}: 重试将越过 deadline，丢弃`)
      return "expired"
    }
    await sleep(delay)
  }

  return "failed"
}

async function processCommand(
  config: { tunnelId: string; apiKey: string },
  command: TunnelCommand,
  receiptMs: number | null,
  controlPlaneRequestID: string | null,
): Promise<void> {
  const channel = command.channel ?? "main"
  const deadlineMs = commandDeadlineMs(command, receiptMs)

  if (!command.request_id || !command.shard_token) {
    log("收到缺少 request_id/shard_token 的命令，忽略")
    return
  }

  if (deadlineExpired(deadlineMs)) {
    log(`← ${command.request_id} 到达时已过 response_timeout，按协议丢弃`)
    return
  }

  if (command.command_type === "session_termination") {
    log(`← session_termination ${command.request_id}`)
    await postTunnelResponse(config, command, {
      request_id: command.request_id,
      channel,
      resp_code: 204,
      resp_type: "session_termination_response",
    }, deadlineMs, controlPlaneRequestID)
    return
  }

  if (command.command_type !== "jsonrpc") {
    log(`← 未支持 command_type=${command.command_type}，按协议忽略`)
    return
  }

  const message = command.jsonrpc
  const hasId = !!message && Object.prototype.hasOwnProperty.call(message, "id")
  const messageId = message ? requestId(message) : undefined
  if (
    !message ||
    message.jsonrpc !== "2.0" ||
    typeof message.method !== "string" ||
    !message.method ||
    (hasId && messageId === undefined)
  ) {
    log(`← ${command.request_id} 非法 JSON-RPC，返回 -32600`)
    await postTunnelResponse(config, command, {
      request_id: command.request_id,
      channel,
      resp_json: jsonRpcError(messageId, -32600, "Invalid Request"),
      resp_headers: { "Content-Type": ["application/json"] },
      resp_code: 400,
      resp_type: "jsonrpc_response",
    }, deadlineMs, controlPlaneRequestID)
    return
  }

  const methodLabel =
    message.method === "tools/call" && typeof message.params?.name === "string"
      ? `tools/call(${message.params.name})`
      : message.method
  const dispatched = await dispatchMcp(message, command.headers)

  if (dispatched.kind === "ack") {
    await postTunnelResponse(config, command, {
      request_id: command.request_id,
      channel,
      resp_code: dispatched.code,
      resp_type: "notify_ack",
    }, deadlineMs, controlPlaneRequestID)

    return
  }

  const outcome = await postTunnelResponse(config, command, {
    request_id: command.request_id,
    channel,
    resp_json: dispatched.json,
    resp_headers: { "Content-Type": ["application/json"] },
    resp_code: dispatched.code,
    resp_type: "jsonrpc_response",
  }, deadlineMs, controlPlaneRequestID)

  if (outcome === "sent") log(`✓ ${methodLabel}`)
}

function pumpTunnelCommandQueue(): void {
  while (running && inFlightCommandCount < MAX_INFLIGHT_COMMANDS && commandQueue.length > 0) {
    const item = commandQueue.shift()
    if (!item) break

    inFlightCommandCount += 1
    void processCommand(
      item.config,
      item.command,
      item.receiptMs,
      item.controlPlaneRequestID,
    )
      .catch(error => log(`command processing failed: ${safeError(error)}`))
      .finally(() => {
        inFlightCommandCount = Math.max(0, inFlightCommandCount - 1)
        pumpTunnelCommandQueue()
      })
  }
}

function enqueueTunnelCommands(
  config: { tunnelId: string; apiKey: string },
  commands: TunnelCommand[],
  receiptMs: number | null,
  controlPlaneRequestID: string | null,
): void {
  for (const command of commands) {
    commandQueue.push({ config, command, receiptMs, controlPlaneRequestID })
  }
  pumpTunnelCommandQueue()
}

async function controlPlaneErrorSummary(response: any): Promise<string> {
  try {
    const raw = await response.text()
    if (!raw) return ""
    try {
      const parsed = JSON.parse(raw)
      const body = parsed?.error ?? parsed
      const code = typeof body?.code === "string" ? body.code : ""
      const message = typeof body?.message === "string" ? body.message : ""
      if (code && message) return `${code}: ${message}`
      if (code) return code
      if (message) return message
    } catch {}
    return raw.slice(0, 240)
  } catch {
    return ""
  }
}

async function warmupControlPlane(
  config: { tunnelId: string; apiKey: string },
  setStatus: StatusSetter,
): Promise<boolean> {
  // Readiness is gated on the first successful Control Plane poll.
  let backoffMs = 1000

  while (running && !stopRequested) {
    const attemptToken = routingState.token

    const controller = beginControlRequest()
    try {
      const response = await fetch(pollURL(config.tunnelId, 30000), {
        method: "GET",
        headers: pollHeaders(config.apiKey),
        timeout: 35,
        signal: controller.signal as any,
        debugLabel: "Tunnel readiness poll",
      })
      const receiptMs = monotonicNowMs()

      if (response.status === 204) {
        recordPollAvailable()
        setStatus("control_plane_ready")
        log("Control Plane ready")
        return true
      }

      if (response.status === 200) {
        recordPollAvailable()
        const controlPlaneRequestID = tunnelServiceRequestID(response)
        let envelope: PollEnvelope
        try {
          envelope = (await response.json()) as PollEnvelope
        } catch (error) {
          log(`readiness poll 200 但 JSON 无法解析：${safeError(error)}`)
          setStatus("control_plane_bad_payload")
          return false
        }

        if (!envelope || !Array.isArray(envelope.commands)) {
          log("readiness poll 200 但 payload 缺少 commands[]")
          setStatus("control_plane_bad_payload")
          return false
        }

        setStatus("control_plane_ready")
        log("Control Plane ready")
        enqueueTunnelCommands(config, envelope.commands, receiptMs, controlPlaneRequestID)
        return true
      }

      if (response.status === 409) {
        const raw = await response.text()
        const correction = parseRoutingCorrection(response, raw)
        if (correction) {
          applyRoutingCorrection(correction)
          log(`readiness poll 409 wrong_cluster：已接受路由修正 · revision=${correction.revision}`)
        } else {
          log("readiness poll 409：无效路由修正，停止")
          setStatus("control_plane_409")
          return false
        }
      } else {
        if (response.status === 408 || response.status >= 500) {
          recordPollDestinationFailure(attemptToken)
        }
        const detail = await controlPlaneErrorSummary(response)
        if (response.status === 401 || response.status === 403) {
          setStatus("auth_failed")
          log(`readiness poll = ${response.status}：鉴权/权限失败${detail ? ` · ${detail}` : ""}`)
          return false
        }

        const retryable = response.status === 408 || response.status === 429 || response.status >= 500
        log(`readiness poll HTTP ${response.status}${detail ? ` · ${detail}` : ""}`)
        if (!retryable) {
          setStatus(`control_plane_${response.status}`)
          return false
        }
      }
    } catch (error) {
      if (!running || stopRequested || controller.signal.aborted) break
      recordPollDestinationFailure(attemptToken)
      log(`Control Plane 网络错误：${safeError(error)}`)
    } finally {
      finishControlRequest(controller)
    }

    if (!running || stopRequested) break
    const delay = backoffMs + Math.floor(Math.random() * 300)
    log(`Control Plane 尚未 ready，${(delay / 1000).toFixed(1)}s 后重试`)
    await sleep(delay)
    backoffMs = Math.min(backoffMs * 2, 15000)
  }

  if (!stopRequested && running) {
    setStatus("control_plane_not_ready")
    log("Control Plane 未就绪")
  }
  return false
}

async function runTunnel(setStatus: StatusSetter): Promise<void> {
  if (running || starting || stopRequested) return

  const foreignLease = liveForeignRuntimeLease()
  if (foreignLease) {
    setStatus("already_running")
    log("检测到另一个仍存活的 Tunnel 实例，拒绝重复启动")
    return
  }

  writeOwnedRuntimeLease("starting", true)
  startRuntimeHeartbeat()
  starting = true
  stopRequested = false
  const config = readConfig()
  if (!config) {
    starting = false
    setStatus("missing_config")
    log("缺少 Tunnel ID 或 Runtime API Key")
    releaseRuntimeOwnership()
    return
  }

  const authOk = await verifyTunnelAccess(setStatus)
  if (!authOk) {
    const stoppedByUser = stopRequested
    starting = false
    stopRequested = false
    if (stoppedByUser) {
      setStatus("stopped")
      log("Tunnel 已停止")
    }
    releaseRuntimeOwnership()
    return
  }

  if (stopRequested) {
    starting = false
    stopRequested = false
    setStatus("stopped")
    log("Tunnel 已停止")
    releaseRuntimeOwnership()
    return
  }

  running = true
  starting = false
  writeOwnedRuntimeLease("online", true)

  const controlPlaneReady = await warmupControlPlane(config, setStatus)
  if (!controlPlaneReady || stopRequested || !running) {
    const stoppedByUser = stopRequested
    running = false
    starting = false
    stopRequested = false
    if (stoppedByUser) {
      setStatus("stopped")
      log("Tunnel 已停止")
    }
    releaseRuntimeOwnership()
    return
  }

  setStatus("polling")
  writeOwnedRuntimeLease("online", true)
  log("Tunnel 已连接")

  let backoffMs = 1000

  while (running) {
    const attemptToken = routingState.token
    const controller = beginControlRequest()
    try {
      const response = await fetch(pollURL(config.tunnelId, 30000), {
        method: "GET",
        headers: pollHeaders(config.apiKey),
        // Keep a 5s guardrail beyond the requested poll wait.
        timeout: 35,
        signal: controller.signal as any,
        debugLabel: "Tunnel long-poll",
      })
      // Anchor response_timeout when response headers arrive, before body decode.
      const receiptMs = monotonicNowMs()

      if (!running) break

      if (response.status === 204) {
        recordPollAvailable()
        backoffMs = 1000
        continue
      }

      if (response.status === 409) {
        const raw = await response.text()
        const correction = parseRoutingCorrection(response, raw)
        if (!correction) {
          log("poll 409：无效 wrong_cluster 路由修正，停止")
          setStatus("poll_409")
          running = false
          break
        }
        applyRoutingCorrection(correction)
        const delay = backoffMs + Math.floor(Math.random() * 300)
        log(`poll 409 wrong_cluster：已接受路由修正 · revision=${correction.revision} · ${Math.ceil(delay / 1000)} 秒后重试`)
        await sleep(delay)
        backoffMs = Math.min(backoffMs * 2, 15000)
        continue
      }

      if (response.status === 401 || response.status === 403) {
        const detail = await controlPlaneErrorSummary(response)
        log(`poll = ${response.status}：鉴权/权限失败${detail ? ` · ${detail}` : ""}`)
        setStatus("auth_failed")
        running = false
        break
      }

      if (response.status !== 200) {
        if (response.status === 408 || response.status >= 500) {
          recordPollDestinationFailure(attemptToken)
        }
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500
        const detail = await controlPlaneErrorSummary(response)
        if (!retryable) {
          log(`poll HTTP ${response.status}：${detail || "非可重试控制面错误"}，停止`)
          setStatus(`poll_${response.status}`)
          running = false
          break
        }

        const delay = Math.max(backoffMs + Math.floor(Math.random() * 300), retryAfterMs(response) ?? 0)
        log(`poll HTTP ${response.status}${detail ? ` · ${detail}` : ""}，${Math.ceil(delay / 1000)} 秒后重试`)
        await sleep(delay)
        backoffMs = Math.min(backoffMs * 2, 15000)
        continue
      }

      recordPollAvailable()
      const controlPlaneRequestID = tunnelServiceRequestID(response)
      let envelope: PollEnvelope
      try {
        envelope = (await response.json()) as PollEnvelope
      } catch (error) {
        log(`poll 200 但 JSON 无法解析：${safeError(error)}`)
        await sleep(backoffMs)
        backoffMs = Math.min(backoffMs * 2, 15000)
        continue
      }

      if (!envelope || !Array.isArray(envelope.commands)) {
        log("poll 200 但 payload 缺少 commands[]，按协议错误退避")
        await sleep(backoffMs)
        backoffMs = Math.min(backoffMs * 2, 15000)
        continue
      }

      backoffMs = 1000
      enqueueTunnelCommands(config, envelope.commands, receiptMs, controlPlaneRequestID)
    } catch (error) {
      if (!running || stopRequested || controller.signal.aborted) break

      recordPollDestinationFailure(attemptToken)
      log(`poll 网络错误：${safeError(error)}`)
      await sleep(backoffMs + Math.floor(Math.random() * 300))
      backoffMs = Math.min(backoffMs * 2, 15000)
    } finally {
      finishControlRequest(controller)
    }
  }

  const stoppedByUser = stopRequested
  running = false
  starting = false
  stopRequested = false
  if (stoppedByUser) {
    setStatus("stopped")
    log("Tunnel 已停止")
  }
  releaseRuntimeOwnership()
}

function stopTunnel(): void {
  if (stopRequested) return
  if (!running && !starting) {
    releaseRuntimeOwnership()
    return
  }

  stopRequested = true
  const lease = readRuntimeLease()
  if (lease?.instance_id === CLIENT_INSTANCE_ID) writeOwnedRuntimeLease("stopping", false)
  backgroundKeepAliveDesired = false
  abortControlRequest()
  void releaseBackgroundKeepAlive()
  running = false
  log("正在停止 Tunnel")
}

function TunnelView() {
  const [tunnelId, setTunnelId] = useState(Storage.get<string>(STORAGE_TUNNEL_ID) ?? "")
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [status, setStatus] = useState(runtimeStatus)
  const [logText, setLogText] = useState(logLines.slice(-DISPLAY_LOG_LINES).join("\n"))
  const [hasKey, setHasKey] = useState(Keychain.contains(KEYCHAIN_API_KEY))
  const [debugLogging, setDebugLogging] = useState(debugLoggingEnabled)
  const [foreignLease, setForeignLease] = useState<TunnelRuntimeLease | null>(liveForeignRuntimeLease())
  const [githubStatusText, setGitHubStatusText] = useState("正在检查 GitHub…")

  logSink = setLogText
  runtimeStatusSink = setStatus

  const refreshGitHubStatus = async () => {
    try {
      const payload = await scriptingGitHubStatusPayload()
      if (payload.token_configured !== true) {
        setGitHubStatusText("未配置 Token · 请到 Scripting → 设置 → GitHub")
        return
      }
      if (payload.available !== true) {
        setGitHubStatusText(
          payload.pro_required === true
            ? "Token 已配置 · 当前 GitHub API 需要 Scripting PRO"
            : "Token 已配置 · GitHub API 当前不可用",
        )
        return
      }
      const permissions = isPlainObject(payload.permissions) ? payload.permissions : {}
      const granted = Object.entries(permissions)
        .filter(([, value]) => String(value) === "granted")
        .map(([name]) => name)
      setGitHubStatusText(
        granted.length > 0
          ? `Token 已配置 · 已授权：${granted.join(", ")}`
          : "Token 已配置 · 当前脚本尚未授权 GitHub 权限",
      )
    } catch (error) {
      setGitHubStatusText(`GitHub 状态检查失败：${safeError(error)}`)
    }
  }

  const requestGitHubBasePermissions = async () => {
    try {
      await GitHub.requestPermissions([
        "read_profile",
        "read_repos",
        "read_contents",
        "write_contents",
      ] as any)
    } catch (error) {
      setGitHubStatusText(`GitHub 授权失败：${safeError(error)}`)
      return
    }
    await refreshGitHubStatus()
  }

  useEffect(() => {
    void refreshGitHubStatus()
    let cancelled = false

    const refresh = () => {
      const foreign = liveForeignRuntimeLease()
      setForeignLease(foreign)
      if (foreign) {
        setStatus(foreign.desired ? `background_${foreign.state}` : "background_stopping")
      } else {
        setStatus(runtimeStatus)
      }
    }

    void (async () => {
      while (!cancelled) {
        refresh()
        await sleep(1000)
      }
    })()

    return () => {
      cancelled = true
      if (logSink === setLogText) logSink = null
      if (runtimeStatusSink === setStatus) runtimeStatusSink = null
    }
  }, [])

  const save = () => {
    const ok = saveConfig(tunnelId, apiKeyInput)
    if (ok) {
      setApiKeyInput("")
      setHasKey(true)
      setRuntimeStatus("configured")
    }
  }

  const toggleTunnel = () => {
    const foreign = liveForeignRuntimeLease()
    if (foreign) {
      if (requestForeignRuntimeStop()) {
        setForeignLease(readRuntimeLease())
        setStatus("background_stopping")
      }
      return
    }

    if (stopRequested) return
    if (running || starting) {
      setRuntimeStatus("stopping")
      stopTunnel()
      return
    }

    if (!saveConfig(tunnelId, apiKeyInput)) return
    setApiKeyInput("")
    setHasKey(true)
    void runTunnel(setRuntimeStatus)
  }

  const foreignActive = foreignLease !== null
  const toggleTitle = foreignActive
    ? foreignLease.desired
      ? "停止后台 Tunnel"
      : "正在停止…"
    : stopRequested
      ? "正在停止…"
      : running || starting
        ? "停止 Tunnel"
        : "启动 Tunnel"

  const stateText = foreignActive
    ? foreignLease.desired
      ? "后台运行中"
      : "后台正在停止"
    : stopRequested
      ? "正在停止"
      : running
        ? "已连接"
        : starting
          ? "正在连接"
          : "未运行"

  const clearKey = () => {
    if (foreignActive) requestForeignRuntimeStop()
    if (running || starting) stopTunnel()
    Keychain.remove(KEYCHAIN_API_KEY)
    setApiKeyInput("")
    setHasKey(false)
    setRuntimeStatus("key_cleared")
    log("Runtime API Key 已从当前脚本 Keychain 删除")
  }

  const toggleDebugLogging = () => {
    const next = !debugLogging
    debugLoggingEnabled = next
    setDebugLogging(next)
    if (!next) {
      logLines = []
      setLogText("")
      return
    }
    log("调试日志已开启")
  }

  const copyLogs = () => {
    const body = logLines.length > 0 ? logLines.join("\n") : "尚无日志"
    const exportText = [
      `ScriptingPlus v${VERSION}`,
      `status=${status}`,
      "",
      body,
    ].join("\n")

    void Pasteboard.setString(exportText)
      .catch(error => log(`复制日志失败：${safeError(error)}`))
  }

  return (
    <NavigationStack>
      <List navigationTitle="ScriptingPlus">
        <Section header={<Text>状态</Text>}>
          <Text>v{VERSION} · {status}</Text>
          <Text>{stateText}</Text>
          <Button title={toggleTitle} action={toggleTunnel} />
          {(running || starting) ? <Text>关闭此页面后 Tunnel 会继续运行。</Text> : null}
          {foreignActive ? <Text>这是另一个仍在运行的后台实例。</Text> : null}
        </Section>

        <Section header={<Text>连接设置</Text>}>
          <TextField
            title="Tunnel ID"
            value={tunnelId}
            onChanged={setTunnelId}
            prompt="tunnel_..."
            textInputAutocapitalization="never"
          />
          <SecureField
            title="Runtime API Key"
            value={apiKeyInput}
            onChanged={setApiKeyInput}
            prompt={hasKey ? "已保存；留空保持原值" : "粘贴 Runtime API Key"}
          />
          <Button title="保存配置" action={save} />
          <Button title="删除 Runtime API Key" action={clearKey} />
        </Section>

        <Section header={<Text>GitHub</Text>}>
          <Text>{githubStatusText}</Text>
          <Button title="刷新 GitHub 状态" action={() => { void refreshGitHubStatus() }} />
          <Button title="授权仓库读写" action={() => { void requestGitHubBasePermissions() }} />
          <Text>Token 由 Scripting → 设置 → GitHub 管理；ScriptingPlus 不保存 Token。</Text>
        </Section>

        <Section header={<Text>调试日志</Text>}>
          <Button title={debugLogging ? "关闭调试日志" : "开启调试日志"} action={toggleDebugLogging} />
          {debugLogging ? <Button title="复制调试日志" action={copyLogs} /> : null}
          {debugLogging ? <Text>{logText || "尚无调试日志"}</Text> : null}
        </Section>
      </List>
    </NavigationStack>
  )
}

async function main() {
  installScenePhaseListener()
  try {
    await Navigation.present({ element: <TunnelView /> })
  } finally {
    logSink = null
    runtimeStatusSink = null

    // Dismissing the control page must not terminate an active Tunnel.
    // Keep this script context alive until its locally-owned Tunnel stops.
    while (running || starting || stopRequested) {
      await sleep(500)
    }

    releaseRuntimeOwnership()
    removeScenePhaseListener()
    await releaseBackgroundKeepAlive()
    Script.exit()
  }
}

main()
