#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import Enquirer from 'enquirer'

const { prompt } = Enquirer

function hasCommand(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const [, , targetDir] = process.argv as string[]
  if (!targetDir) {
    console.error('Usage: create-nextjs <project-name>')
    process.exit(1)
  }

  // 1. Select language
  const { language } = await prompt<{ language: 'TypeScript' | 'JavaScript' }>({
    type: 'select',
    name: 'language',
    message: 'Preferred app language?',
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
    type: 'confirm',
    name: 'initialize',
    message: 'Initialize TideCloak now? Your server must be running.',
    initial: true
  })

  if (!initialize) {
    console.log('Initialization skipped.')
  } else {
    // 4. Check prerequisites
    let missing = ['curl', 'jq'].filter(cmd => !hasCommand(cmd))
    if (missing.length > 0) {
      console.warn(`Missing prerequisites: ${missing.join(', ')}`)
      const { action } = await prompt<{ action: string }>({
        type: 'input',
        name: 'action',
        message: `Please install the missing prerequisites (${missing.join(', ')}), then press ENTER to retry, or type 'skip' to skip initialization`
      })
      if (action.trim().toLowerCase() === 'skip') {
        console.log('Initialization skipped.')
        console.log(`"${targetDir}" is ready!`)
        console.log(`"Start developing your app here: `)
        console.log(`  cd ${targetDir} && npm install`)
        console.log(`To run init later: cd ${targetDir} && bash init/tcinit.sh`)
        return
      }
      // retry
      missing = ['curl', 'jq'].filter(cmd => !hasCommand(cmd))
      if (missing.length > 0) {
        console.warn(`Still missing: ${missing.join(', ')}. Skipping initialization.`)
        console.log(`"${targetDir}" is ready!`)
        console.log(`"Start developing your app here: `)
        console.log(`  cd ${targetDir} && npm install`)
        console.log(`To run init later: cd ${targetDir} && bash init/tcinit.sh`)
        return
      }
    }

    // 5. Collect config values
    const { tideUrl } = await prompt<{ tideUrl: string }>({
      type: 'input',
      name: 'tideUrl',
      message: 'TideCloak server URL:',
      initial: 'http://localhost:8080',
      validate: (input: string) =>
        input.trim() === input || 'No trailing spaces'
    })

    const { realmName } = await prompt<{ realmName: string }>({
      type: 'input',
      name: 'realmName',
      message: 'TideCloak new Realm name:',
      initial: 'nextjs-test',
      validate: (input: string) =>
        input.trim().length > 0 || 'Please enter a realm name'
    })

    const { clientName } = await prompt<{ clientName: string }>({
      type: 'input',
      name: 'clientName',
      message: 'TideCloak new Client name:',
      initial: 'myclient',
      validate: (input: string) =>
        input.trim().length > 0 || 'Please enter a client name'
    })

    const { clientAppUrl } = await prompt<{ clientAppUrl: string }>({
      type: 'input',
      name: 'clientAppUrl',
      message: 'This App URL (e.g. http://localhost:3000):',
      initial: 'http://localhost:3000',
      validate: (input: string) =>
        input.trim().length > 0 || 'Please enter your app URL'
    })

    const { kcUser } = await prompt<{ kcUser: string }>({
      type: 'input',
      name: 'kcUser',
      message: 'TideCloak bootstrap / master admin username:',
      initial: 'admin',
      validate: (input: string) =>
        input.trim().length > 0 || 'Please enter a username'
    })

    const { kcPassword } = await prompt<{ kcPassword: string }>({
      type: 'input',
      name: 'kcPassword',
      message: 'TideCloak bootstrap / master admin password:',
      initial: 'password',
      validate: (input: string) =>
        input.trim().length > 0 || 'Please enter a password'
    })

    const { subscriptionEmail } = await prompt<{ subscriptionEmail: string }>({
      type: 'input',
      name: 'subscriptionEmail',
      message: 'Enter an email to manage your license',
      initial: '',
      validate: (input: string) =>
        input.trim().length > 0 || 'Please enter an email'
    })

    const { termsAccepted } = await prompt<{ termsAccepted: boolean }>([{
      type: 'confirm',
      name: 'termsAccepted',
      message: 'I agree to the Terms & Conditions (https://tide.org/legal)',
      initial: false
    }]);

    if (!termsAccepted) {
        console.log('Initialization skipped.')
        console.log(`"${targetDir}" is ready!`)
        console.log(`"Start developing your app here: `)
        console.log(`cd ${targetDir} && npm install`)
        console.log(`To run init later: cd ${targetDir} && bash init/tcinit.sh`)
        return
    }

    // 6. Run initialization script
    const { runInit } = await prompt<{ runInit: boolean }>({
      type: 'confirm',
      name: 'runInit',
      message: 'Ready to initialize TideCloak?',
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
              NEW_REALM_NAME: realmName,
              CLIENT_NAME: clientName,
              CLIENT_APP_URL: clientAppUrl,
              KC_USER: kcUser,
              KC_PASSWORD: kcPassword,
              SUBSCRIPTION_EMAIL: subscriptionEmail
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
  }

  // 7. Final instructions
  console.log(`"${targetDir}" is ready!`)
  console.log("Proceed to run your app:")
  console.log(`cd ${targetDir} && npm install && npm run dev`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
