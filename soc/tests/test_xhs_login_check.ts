import { xhsCheckLogin, loadXhsSession } from '../src/xiaohongshu.ts'
import { normalizeConfig } from '../src/config-runtime.ts'

async function run() {
  const cfg = normalizeConfig({
    runtime: {
      project_root: 'd:/666/gzh/dsh-plugin/tasks/default',
    },
    accounts: {
      xhs: {
        platform: 'xiaohongshu',
        name: '小红书测试',
        enabled: true,
      } as any,
    },
  } as any)

  console.log('Testing xhsCheckLogin on account "xhs"...')
  const status = await xhsCheckLogin(cfg, 'xhs')
  console.log('xhsCheckLogin result:', status)

  const saved = loadXhsSession(cfg, 'xhs')
  console.log('Saved session file exists:', Boolean(saved))
  if (saved) {
    console.log('Saved account_id:', saved.account_id)
    console.log('Saved user_name:', saved.user_name)
    console.log('Saved red_id:', saved.red_id)
    console.log('Saved user_id:', saved.user_id)
    console.log('Saved cookies count:', saved.cookies?.length)
  }

  if (status.logged_in && saved && saved.cookies?.length > 0) {
    console.log('VERIFICATION SUCCESSFUL: Login detected and credentials successfully stored on disk!')
  } else {
    console.error('VERIFICATION FAILED!')
    process.exit(1)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
