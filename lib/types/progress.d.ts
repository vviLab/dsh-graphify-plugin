/** Structural face of DSH's job registry; the plugin declares no dependency on it. */
export interface JobHandleLike {
    readonly id: string;
    append(text: string, options?: {
        channel?: 'stdout' | 'stderr' | 'log';
        gapBefore?: true;
    }): void;
    updateProgress(line: string): void;
}
export interface JobOutcomeLike {
    status: 'completed' | 'killed' | 'failed';
    detail?: string;
    result?: string;
}
export interface JobSpecLike {
    kind: string;
    label: string;
    owner?: string;
    run(job: JobHandleLike): {
        cancel(reason?: string): void;
        done: Promise<JobOutcomeLike>;
    };
}
export interface JobRegistryLike {
    start(spec: JobSpecLike): unknown;
    list?(caller?: string): readonly JobViewLike[];
}
/** Projection fields this plugin reads; the registry supplies the rest. */
export interface JobViewLike {
    readonly id: string;
    readonly kind: string;
    readonly label: string;
    readonly status: string;
    readonly startedAt?: number;
    readonly progress?: string;
}
/** One category tally of the pre-build scan. */
export interface SourceInventory {
    readonly code: number;
    readonly docs: number;
    readonly papers: number;
    readonly images: number;
    /** Files that force semantic extraction, i.e. docs + papers + images. */
    readonly semantic: number;
    readonly scanned: number;
    readonly truncated: boolean;
}
/**
 * Counts the files a build will see, by category.
 *
 * This is an approximation of Graphify's own ignore rules: it skips the
 * directories that never carry corpus files and caps the walk, which is why the
 * command reports it as `≈`. Its purpose is to state the order of magnitude
 * before minutes are spent, not to predict the exact node count.
 *
 * @param projectRoot - directory the build targets.
 * @param limit - maximum entries inspected.
 * @returns per-category counts and whether the walk was cut short.
 */
export declare function scanSourceInventory(projectRoot: string, limit?: number): SourceInventory;
/**
 * Renders the preflight as the lines a build reports before it starts.
 *
 * @param inventory - result of {@link scanSourceInventory}.
 * @param options - whether an LLM key resolved, and which flags the build carries.
 * @returns one multi-line summary.
 */
export declare function describeInventory(inventory: SourceInventory, options: {
    hasLlmKey: boolean;
    flags: readonly string[];
}): string;
/** Resolves the Host job registry when this deployment provides one. */
export declare function resolveJobRegistry(ctx: unknown): JobRegistryLike | null;
export interface StartBuildJobOptions {
    readonly registry: JobRegistryLike;
    readonly label: string;
    readonly owner?: string;
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly preflight: string;
    /** Runs after a zero exit code, before the job settles; its text is appended as narration. */
    readonly finalize?: (output: string) => Promise<string | undefined> | string | undefined;
}
/**
 * Starts a Graphify build as a Host job and returns its id immediately.
 *
 * Every stdout/stderr write becomes a job chunk, so a client that renders the
 * job stream shows progress while the build runs; the last non-empty line also
 * becomes the job's live progress line. Cancelling the job terminates the child
 * with the same escalation used by the blocking path.
 *
 * @param options - resolved command, project context, and preflight narration.
 * @returns the registry-issued job id.
 */
export declare function startBuildJob(options: StartBuildJobOptions): string;
/**
 * Renders the running Graphify jobs owned by one Session.
 *
 * @param registry - Host job registry, when available.
 * @param sessionId - owning Session; omitted reads the unowned roster the registry allows.
 * @returns one line per running job, newest first.
 */
export declare function describeRunningJobs(registry: JobRegistryLike | null, sessionId?: string): string[];
