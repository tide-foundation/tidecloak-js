#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import Enquirer from 'enquirer'

const { prompt } = Enquirer

async function main(): Promise<void> {
  const [, , targetDir] = process.argv as string[]
  if (!targetDir) {
    console.error('Usage: create-nextjs <project-name>')
    process.exit(1)
  }

  // 1. Select language
  const { language } = await prompt<{ language: 'TypeScript' | 'JavaScript' }>({
    type:    'select',
    name:    'language',
    message: 'Which language would you like?',
    choices: ['TypeScript', 'JavaScript']
  })

  // 2. Scaffold template
  const packageRoot = path.resolve(__dirname, '..', '..')
  const templateName = language === 'TypeScript'
    ? 'template-ts-app'
    : 'template-js-app'
  const templateDir = path.resolve(packageRoot, templateName)
  fs.cpSync(templateDir, targetDir, { recursive: true })
  console.log(`Scaffolded ${language} template into "${targetDir}"`)

  // 3. Prompt for initialization
  const { initialize } = await prompt<{ initialize: boolean }>({
    type:    'confirm',
    name:    'initialize',
    message: 'Run TideCloak initialization now? Ensure your server is running.',
    initial: true
  })

  if (initialize) {
    // 4. Collect config values
    const { tideUrl } = await prompt<{ tideUrl: string }>({
      type:    'input',
      name:    'tideUrl',
      message: 'TideCloak server URL:',
      initial: 'http://localhost:8080',
      validate: (input: string) =>
        input.trim() === input || 'No trailing spaces'
    })

    const { realmName } = await prompt<{ realmName: string }>({
      type:    'input',
      name:    'realmName',
      message: 'Realm name:',
      initial: 'nextjs-test',
      validate: (input: string) =>
        input.trim().length > 0 || 'Please enter a realm name'
    })

    const { clientName } = await prompt<{ clientName: string }>({
      type:    'input',
      name:    'clientName',
      message: 'Client name:',
      initial: 'myclient',
      validate: (input: string) =>
        input.trim().length > 0 || 'Please enter a client name'
    })

    const { clientAppUrl } = await prompt<{ clientAppUrl: string }>({
      type:    'input',
      name:    'clientAppUrl',
      message: 'Client App URL (e.g. http://localhost:3000):',
      initial: 'http://localhost:3000',
      validate: (input: string) =>
        input.trim().length > 0 || 'Please enter your app URL'
    })

    const { kcUser } = await prompt<{ kcUser: string }>({
      type:    'input',
      name:    'kcUser',
      message: 'Master admin username:',
      initial: 'admin',
      validate: (input: string) =>
        input.trim().length > 0 || 'Please enter a username'
    })

    const { kcPassword } = await prompt<{ kcPassword: string }>({
      type:    'input',
      name:    'kcPassword',
      message: 'Master admin password:',
      initial: 'password',
      validate: (input: string) =>
        input.trim().length > 0 || 'Please enter a password'
    })

    // 5. Run initialization script
    const { runInit } = await prompt<{ runInit: boolean }>({
      type:    'confirm',
      name:    'runInit',
      message: 'Continue with tidecloak initialization?',
      initial: true
    })

    if (runInit) {
      console.log('Running tcinit.sh...')
      try {
        execSync(
          `bash "${path.resolve(packageRoot, 'init', 'tcinit.sh')}"`,
          {
            cwd: path.resolve(process.cwd(), targetDir),
            stdio: 'inherit',
            env: {
              ...process.env,
              TIDECLOAK_LOCAL_URL: tideUrl,
              NEW_REALM_NAME:      realmName,
              CLIENT_NAME:         clientName,
              CLIENT_APP_URL:      clientAppUrl,
              KC_USER:             kcUser,
              KC_PASSWORD:         kcPassword
            }
          }
        )
        console.log('Initialization script completed successfully.')

        // Move generated adapter config if present
        const srcConfig = path.resolve(packageRoot, 'tidecloak.json')
        const destConfig = path.resolve(process.cwd(), targetDir, 'tidecloak.json')
        if (fs.existsSync(srcConfig)) {
          fs.copyFileSync(srcConfig, destConfig)
          console.log(`Adapter config moved to "${targetDir}/tidecloak.json"`)
        } else {
          console.warn(`Adapter config not found at ${srcConfig}`)
        }
      } catch (err: any) {
        console.error('Initialization script error:', err.message)
        console.log(`To retry: cd ${targetDir} && bash init/tcinit.sh`)
      }
    } else {
      console.log(`To run init later: cd ${targetDir} && bash init/tcinit.sh`)
    }
  } else {
    console.log('Initialization skipped.')
  }

  // 6. Final instructions
  console.log(`"${targetDir}" is ready!`)
  console.log(`cd ${targetDir} && npm install && npm run dev`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
