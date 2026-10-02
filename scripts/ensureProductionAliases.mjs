#!/usr/bin/env node
/**
 * Ensure production custom domains point at the latest READY main deployment.
 *
 * Vercel can build a production-target deployment while leaving custom aliases
 * on an older deployment. This script closes that gap.
 *
 * Env:
 *   VERCEL_TOKEN (required)
 *   VERCEL_TEAM_ID (default: gob-cash team)
 *   VERCEL_PROJECT_ID (default: gob-cash)
 *   EXPECTED_SHA (optional; defaults to current git HEAD)
 */
import { execSync } from 'node:child_process'
import process from 'node:process'

const TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_iYeO7yeANF0HbheM3m4mHjUl'
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_2XOcEqH3vCxy0EDRwd47TKxbENIg'
const TOKEN = process.env.VERCEL_TOKEN
const ALIASES = [
  'www.mozpaga.xyz',
  'mozpaga.xyz',
  'gobankless.app',
  'www.gobankless.app',
  'gob-cash.vercel.app',
]

if (!TOKEN) {
  console.error('VERCEL_TOKEN is required')
  process.exit(1)
}

function gitSha() {
  if (process.env.EXPECTED_SHA) return process.env.EXPECTED_SHA.trim()
  return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
}

async function api(path, init = {}) {
  const url = new URL(`https://api.vercel.com${path}`)
  if (!url.searchParams.has('teamId')) url.searchParams.set('teamId', TEAM_ID)
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) {
    throw new Error(`${init.method || 'GET'} ${path} -> ${res.status}: ${text}`)
  }
  return body
}

async function waitForDeployment(sha, attempts = 36) {
  for (let i = 0; i < attempts; i++) {
    const data = await api(`/v6/deployments?projectId=${PROJECT_ID}&limit=20`)
    const match = (data.deployments || []).find(
      (d) =>
        d.meta?.githubCommitSha === sha &&
        (d.target === 'production' || d.readyState === 'READY' || d.state === 'READY')
    )
    if (match && (match.readyState === 'READY' || match.state === 'READY')) {
      return match
    }
    if (match && (match.readyState === 'ERROR' || match.state === 'ERROR')) {
      throw new Error(`Deployment for ${sha} failed: ${match.uid || match.id}`)
    }
    console.log(`waiting for READY production deploy of ${sha.slice(0, 7)} (${i + 1}/${attempts})`)
    await new Promise((r) => setTimeout(r, 10_000))
  }
  throw new Error(`Timed out waiting for production deployment of ${sha}`)
}

async function assignAlias(deploymentId, alias) {
  const body = await api(`/v2/deployments/${deploymentId}/aliases`, {
    method: 'POST',
    body: JSON.stringify({ alias }),
  })
  return body
}

async function main() {
  const sha = gitSha()
  console.log(`ensuring production aliases for ${sha}`)
  const deployment = await waitForDeployment(sha)
  const deploymentId = deployment.uid || deployment.id
  console.log(`deployment ${deploymentId} ready`)

  for (const alias of ALIASES) {
    const result = await assignAlias(deploymentId, alias)
    console.log(`alias ${alias} -> ${deploymentId}${result?.oldDeploymentId ? ` (was ${result.oldDeploymentId})` : ''}`)
  }

  // Verify
  for (const alias of ['www.mozpaga.xyz', 'gobankless.app']) {
    const info = await api(`/v2/aliases/${encodeURIComponent(alias)}`)
    const pointed = info.deployment?.id || info.deploymentId
    if (pointed !== deploymentId) {
      throw new Error(`${alias} still points at ${pointed}, expected ${deploymentId}`)
    }
    console.log(`verified ${alias} -> ${pointed}`)
  }
  console.log('production aliases match latest main commit')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
