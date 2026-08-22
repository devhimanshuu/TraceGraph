/**
 * GitDiffEngine — detects revisions and computes ChangeSets between commits.
 *
 * Uses safe git command invocation (argument arrays, no shell interpolation).
 * Operates on a workspace root that was cloned by the ingestion pipeline.
 */
import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ChangeSet, FileChange, FileChangeStatus, Revision } from '@tracegraph/shared';

const execFileAsync = promisify(execFile);

const logger = new Logger('GitDiffEngine');

@Injectable()
export class GitDiffEngine {
  /**
   * Get the current HEAD revision SHA for a repository workspace.
   */
  async getCurrentRevision(workspaceRoot: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd: workspaceRoot,
        timeout: 10_000,
      });
      return stdout.trim();
    } catch (err) {
      logger.warn(`Failed to get current revision: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Get full revision details for a SHA.
   */
  async getRevisionDetails(
    workspaceRoot: string,
    sha: string,
  ): Promise<Revision | null> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        [
          'log', '-1', '--format=%H|%P|%an|%s|%aI',
          sha,
        ],
        { cwd: workspaceRoot, timeout: 10_000 },
      );

      const [fullSha, parentSha, author, message, timestamp] = stdout.trim().split('|');
      if (!fullSha) return null;

      // Get branch name
      let branch = 'main';
      try {
        const { stdout: branchOut } = await execFileAsync(
          'git', ['rev-parse', '--abbrev-ref', 'HEAD'],
          { cwd: workspaceRoot, timeout: 5_000 },
        );
        branch = branchOut.trim();
      } catch {
        // Non-fatal
      }

      return {
        sha: fullSha,
        parentSha: parentSha || null,
        branch,
        author: author || 'unknown',
        message: message || '',
        timestamp: timestamp || new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.warn(`Failed to get revision details for ${sha}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Get the number of commits between two revisions (approximate).
   */
  async getCommitsBehind(
    workspaceRoot: string,
    fromSha: string,
    toSha: string,
  ): Promise<number> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['rev-list', '--count', `${fromSha}..${toSha}`],
        { cwd: workspaceRoot, timeout: 10_000 },
      );
      return parseInt(stdout.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Compute a ChangeSet between two revisions.
   *
   * Uses `git diff --name-status` for reliable change classification
   * and `git diff --stat` for line counts.
   */
  async computeChangeSet(
    workspaceRoot: string,
    fromRevision: string,
    toRevision: string,
  ): Promise<ChangeSet> {
    const startedAt = Date.now();

    // Get name-status diff (ADDED, MODIFIED, DELETED, RENAMED, COPIED)
    const { stdout: nameStatusOutput } = await execFileAsync(
      'git',
      ['diff', '--name-status', '--diff-filter=AMDR', fromRevision, toRevision],
      { cwd: workspaceRoot, timeout: 30_000 },
    );

    // Get numstat for line counts
    let numstatOutput = '';
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['diff', '--numstat', fromRevision, toRevision],
        { cwd: workspaceRoot, timeout: 30_000 },
      );
      numstatOutput = stdout;
    } catch {
      // Non-fatal — line counts are optional
    }

    // Parse numstat into a map: path → { added, deleted }
    const numstatMap = new Map<string, { added: number; deleted: number }>();
    for (const line of numstatOutput.split('\n')) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const added = parseInt(parts[0], 10);
        const deleted = parseInt(parts[1], 10);
        const path = parts[2];
        if (!isNaN(added) && !isNaN(deleted) && path) {
          numstatMap.set(path, { added, deleted });
        }
      }
    }

    const addedFiles: FileChange[] = [];
    const modifiedFiles: FileChange[] = [];
    const deletedFiles: FileChange[] = [];
    const renamedFiles: FileChange[] = [];

    for (const line of nameStatusOutput.split('\n')) {
      if (!line.trim()) continue;

      const parts = line.split('\t');
      const statusChar = parts[0]?.charAt(0);
      const statusLetter = parts[0]?.trim();

      if (!statusChar) continue;

      let status: FileChangeStatus;
      let filePath: string;
      let oldPath: string | undefined;

      if (statusLetter?.startsWith('R') || statusLetter?.startsWith('C')) {
        // Renamed or copied: R100\told\tnew
        status = statusLetter.charAt(0) === 'R' ? 'RENAMED' : 'COPIED';
        oldPath = parts[1];
        filePath = parts[2];
      } else {
        filePath = parts[1];
        switch (statusChar) {
          case 'A': status = 'ADDED'; break;
          case 'M': status = 'MODIFIED'; break;
          case 'D': status = 'DELETED'; break;
          default: continue; // Skip unknown status types
        }
      }

      if (!filePath) continue;

      const numstat = numstatMap.get(filePath);
      const change: FileChange = {
        path: filePath,
        status,
        oldPath,
        linesAdded: numstat?.added,
        linesDeleted: numstat?.deleted,
      };

      switch (status) {
        case 'ADDED': addedFiles.push(change); break;
        case 'MODIFIED': modifiedFiles.push(change); break;
        case 'DELETED': deletedFiles.push(change); break;
        case 'RENAMED':
        case 'COPIED': renamedFiles.push(change); break;
      }
    }

    const totalChanges = addedFiles.length + modifiedFiles.length + deletedFiles.length + renamedFiles.length;

    const changeSet: ChangeSet = {
      fromRevision,
      toRevision,
      addedFiles,
      modifiedFiles,
      deletedFiles,
      renamedFiles,
      totalChanges,
      computedAt: new Date().toISOString(),
    };

    logger.log(
      `ChangeSet computed in ${Date.now() - startedAt}ms: ` +
      `+${addedFiles.length} added, ~${modifiedFiles.length} modified, ` +
      `-${deletedFiles.length} deleted, ~${renamedFiles.length} renamed/copied`,
    );

    return changeSet;
  }
}
