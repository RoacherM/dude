/**
 * Host half of the dude plugin. It answers one question for the Dude desktop
 * shell before a kernel update restarts dsh: would stopping dsh now interrupt
 * work? The shell spawns dsh with an IPC channel and sends
 * `{ type: 'update-tasks', requestId }`; this half replies with
 * `{ type: 'update-tasks', requestId, active }` or `{ ..., error }`.
 *
 * "Active" is the official desktop host's rule (dsh-desktop-host
 * `hasDesktopActiveTasks`): an agent is running or has queued inbox messages,
 * or a background job is running or stopping. Outside the desktop shell (dev
 * profile, plain `dsh`) there is no IPC channel and this half does nothing.
 */

export const name = 'dude'

function hasActiveTasks(agents, jobs) {
  const liveAgents = agents.list()
  return liveAgents.some((agent) => agent.status === 'running'
    || agent.inbox.nextTurn.length > 0
    || agent.inbox.nextStep.length > 0)
    || [undefined, ...liveAgents].some((agent) => jobs.list(agent?.id)
      .some((job) => job.status === 'running' || job.status === 'stopping'))
}

export function apply(ctx) {
  if (typeof process.send !== 'function') return
  ctx.effect(() => {
    const onMessage = (message) => {
      if (message?.type !== 'update-tasks') return
      const { requestId } = message
      try {
        const agents = ctx.get('agents')
        const jobs = ctx.get('jobs')
        if (agents === undefined || jobs === undefined) throw new Error('agents or jobs service is unavailable')
        process.send({ type: 'update-tasks', requestId, active: hasActiveTasks(agents, jobs) })
      } catch (error) {
        process.send({ type: 'update-tasks', requestId, error: String(error?.message ?? error) })
      }
    }
    process.on('message', onMessage)
    return () => process.off('message', onMessage)
  }, 'dude: update task inspection')
}
