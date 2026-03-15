import { execSync } from 'node:child_process';

async function globalSetup(): Promise<void> {
  console.log('Seeding test database for Playwright...');

  execSync('npm --prefix ../api run db:reset', {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  console.log('Test database ready for Playwright.');
}

export default globalSetup;
