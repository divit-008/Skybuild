import express from 'express';
import { PrismaClient } from '../../generated/prisma';
import { verifyJWT } from '../../middlewares/authMiddleware';
import { Queue } from 'bullmq';
import { connection } from '../../config/redis';

const prisma = new PrismaClient();
const router = express.Router();

const buildQueue = new Queue('builds', { connection });

router.get('/apps', verifyJWT, async (req, res) => {
  const user = req.user!;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { githubId: user.githubId },
      include: { deployments: true },
    });

    if (!dbUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ deployments: dbUser.deployments });
  } catch (err) {
    console.error('Error fetching deployments:', err);
    res.status(500).json({ error: 'Failed to load deployments' });
  }
});

router.post('/apps', verifyJWT, async (req, res) => {
  const { name, repoUrl, buildPath = '' } = req.body;
  const user = req.user!;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { githubId: user.githubId },
    });

    if (!dbUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deployment = await prisma.deployment.create({
      data: {
        name,
        repoUrl,
        status: 'pending',
        userId: dbUser.id,
      },
    });

    await buildQueue.add('build', {
      deploymentId: deployment.id,
      repoUrl: deployment.repoUrl,
      buildPath, // ✅ send to worker
    });

    res.status(201).json({ deployment });
  } catch (err) {
    console.error('Error creating deployment:', err);
    res.status(500).json({ error: 'Failed to create deployment' });
  }
});

export default router;
