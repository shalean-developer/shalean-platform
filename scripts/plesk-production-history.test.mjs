import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const workflow = readFileSync(new URL('../.github/workflows/prebuilt-plesk-production.yml', import.meta.url), 'utf8');
const block = workflow.split('      - name: Publish deploy branch')[1];
const publish = block.split('        run: |\n')[1].split('\n').map(l => l.replace(/^          /, '')).join('\n');
test('production publish bridges the Plesk anchor and supports subsequent fast-forward pulls', () => {
  assert.ok(!publish.includes('--force') && !publish.includes('--orphan'));
  const root = mkdtempSync(join(tmpdir(), 'plesk-prod-history-'));
  const env = { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid' };
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    const remote = join(root, 'remote.git'); const work = join(root, 'publisher'); const plesk = join(root, 'plesk');
    git(root, 'init', '--bare', remote); git(root, 'clone', remote, work);
    git(work, 'switch', '--orphan', 'deploy/production'); writeFileSync(join(work, 'old'), 'old'); git(work, 'add', '.'); git(work, 'commit', '-m', 'Plesk anchor');
    const anchor = git(work, 'rev-parse', 'HEAD'); git(work, 'push', 'origin', 'HEAD:refs/heads/deploy/production'); git(work, 'push', 'origin', 'HEAD:refs/heads/anchor');
    git(root, 'clone', '--branch', 'deploy/production', remote, plesk);
    git(work, 'switch', '--orphan', 'broken'); git(work, 'rm', '-rf', '--ignore-unmatch', '.'); writeFileSync(join(work, 'other'), 'other'); git(work, 'add', '.'); git(work, 'commit', '-m', 'unrelated current artifact'); git(work, 'push', '--force', 'origin', 'HEAD:refs/heads/deploy/production');
    writeFileSync(join(root, 'production-runtime.tar.gz'), 'synthetic archive'); writeFileSync(join(root, 'activate.sh'), '# synthetic activation');
    for (const sha of ['release-one', 'release-two']) {
      execFileSync('bash', ['-c', publish], { cwd: work, env: { ...env, RUNNER_TEMP: root, GITHUB_SHA: sha, PLESK_PRODUCTION_HISTORY_ANCHOR: anchor }, stdio: 'pipe' });
      git(plesk, 'pull', '--ff-only', 'origin', 'deploy/production');
      assert.equal(readFileSync(join(plesk, 'release-sha.txt'), 'utf8').trim(), sha);
      git(plesk, 'merge-base', '--is-ancestor', anchor, 'HEAD');
      assert.equal(git(plesk, 'ls-tree', '--name-only', 'HEAD'), 'activate.sh\nproduction-runtime.tar.gz\nrelease-sha.txt');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
