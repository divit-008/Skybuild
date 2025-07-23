import { Worker, QueueEvents } from 'bullmq';
import { connection } from '../config/redis';
import { PrismaClient } from '../generated/prisma';
import simpleGit from 'simple-git';
import { exec, execFile } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

const prisma = new PrismaClient();

const worker = new Worker(
  'builds',
  async (job) => {
    const { deploymentId, repoUrl, buildPath = '' } = job.data;

    console.log('🧾 Job data:', job.data);
    console.log(`🔧 Building deployment ${deploymentId} from ${repoUrl}`);

    const repoName = `build-${deploymentId}`;
    const repoPath = path.join(__dirname, '../../../tmp', repoName);
    const targetPath = buildPath ? path.join(repoPath, buildPath) : repoPath;

    try {
      await fs.rm(repoPath, { recursive: true, force: true });
      await simpleGit().clone(repoUrl, repoPath);

      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: 'building' },
      });

      console.log(`📦 Running build in: ${targetPath}`);

      await new Promise((resolve, reject) => {
        exec('npm install && npm run build', { cwd: targetPath }, (err, stdout, stderr) => {
          if (err) {
            console.error(stderr);
            return reject(err);
          }
          console.log(stdout);
          resolve(true);
        });
      });

      const subdomain = `app-${deploymentId}`;
      const domain = `${subdomain}.localhost`;
      const imageTag = subdomain;
      const containerName = subdomain;

      console.log(`🐳 Building Docker image: ${imageTag}`);

      await new Promise((resolve, reject) => {
        exec(
          `docker build -t ${imageTag} -f ${path.join(__dirname, '../docker/react-vite.Dockerfile')} .`,
          { cwd: targetPath },
          (err, stdout, stderr) => {
            if (err) {
              console.error(stderr);
              return reject(err);
            }
            console.log(stdout);
            resolve(true);
          }
        );
      });

      console.log(`🚀 Running container with Traefik subdomain: ${domain}`);

      await new Promise((resolve, reject) => {
        execFile(
          'docker',
          [
            'run',
            '-d',
            '--name', containerName,
            '--label', 'traefik.enable=true',
            '--label', `traefik.http.routers.${subdomain}.rule=Host(${domain})`,
            '--label', `traefik.http.routers.${subdomain}.entrypoints=web`,
            '--label', `traefik.http.services.${subdomain}.loadbalancer.server.port=4173`,
            imageTag
          ],
          (err, stdout, stderr) => {
            if (err) {
              console.error(stderr);
              return reject(err);
            }
            console.log(stdout);
            resolve(true);
          }
        );
      });

      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: 'running',
          containerName,
          url: `http://${domain}`,
        },
      });

      console.log(`✅ Deployment ${deploymentId} is live at http://${domain}`);
    } catch (err) {
      console.error(`❌ Build failed for ${deploymentId}:`, err);
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: 'failed' },
      });
    }
  },
  { connection }
);

const events = new QueueEvents('builds', { connection });
events.on('failed', ({ jobId, failedReason }) => {
  console.error(`❌ Job ${jobId} failed: ${failedReason}`);
});
