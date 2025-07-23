import express from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { ENV } from '../../config/env';
import { PrismaClient } from '../../generated/prisma'; 

const prisma = new PrismaClient();
const router = express.Router();

router.get('/github', (_req, res) => {
    const redirectUrl = `https://github.com/login/oauth/authorize?client_id=${ENV.GITHUB_CLIENT_ID}&scope=user:email`;
    res.redirect(redirectUrl);
});

router.get('/github/callback', async (req, res) => {
    const { code } = req.query;
    console.log('➡️ GitHub callback triggered with code:', code);

    if (!code) {
        return res.status(400).json({ error: 'Missing code from Github' });
    }

    try {
        const tokenRes = await axios.post(
            'https://github.com/login/oauth/access_token',
            {
                client_id: ENV.GITHUB_CLIENT_ID,
                client_secret: ENV.GITHUB_CLIENT_SECRET,
                code,
            },
            { headers: { Accept: 'application/json' } }
        );

        console.log('✅ Received token response:', tokenRes.data);

        const access_token = tokenRes.data.access_token;

        const userRes = await axios.get('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        console.log('✅ GitHub user info:', userRes.data);

        const user = userRes.data;

        const existingUser = await prisma.user.findUnique({
            where: { githubId: user.id }
        });

        let dbUser;

        if (!existingUser) {
            dbUser = await prisma.user.create({
                data: {
                    githubId: user.id,
                    username: user.login,
                    fullName: user.name || '',
                }
            });
        } else {
            dbUser = existingUser;
        }

        console.log('✅ DB user:', dbUser);

        const jwtToken = jwt.sign(
            {
                githubId: dbUser.githubId,
                username: dbUser.username,
                fullName: dbUser.fullName,
            },
            ENV.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ token: jwtToken });
    } catch (err) {
        console.error('Github Oauth error:', err);
        res.status(500).json({ error: 'Github authentication failed' });
    }
});

export default router;
