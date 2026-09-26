import { BaseSeeder } from '@adonisjs/lucid/seeders'
import env from '#start/env'
import User from '#models/user'

/**
 * Seeds the single admin account for the OSS (single tenant) edition.
 * Credentials are taken from the ADMIN_EMAIL / ADMIN_PASSWORD env vars.
 */
export default class extends BaseSeeder {
  async run() {
    await User.updateOrCreate(
      { email: env.get('ADMIN_EMAIL') },
      {
        fullName: 'Admin',
        email: env.get('ADMIN_EMAIL'),
        password: env.get('ADMIN_PASSWORD'),
      }
    )
  }
}
