import { pool } from './connection';
import bcrypt from 'bcryptjs';

async function resetPassword() {
  try {
    const allUsers = await pool.query('SELECT id, email FROM "user"');
    console.log('All users:', JSON.stringify(allUsers.rows, null, 2));

    if (allUsers.rows.length === 0) {
      console.log('No users found!');
      return;
    }

    const user = allUsers.rows[0];
    console.log(`\nResetting password for: ${user.email}`);

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Jahna@1995', salt);

    await pool.query(
      'UPDATE "user" SET password = $1, "updatedAt" = NOW() WHERE id = $2',
      [hashedPassword, user.id]
    );

    console.log('✅ Password reset successfully!');
    console.log(`Email: ${user.email}`);
    console.log(`Password: Jahna@1995`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

resetPassword();
