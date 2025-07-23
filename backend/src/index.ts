import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import authRoutes from './api/routes/auth.routes';
import appRoutes from './api/routes/app.routes';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/auth', authRoutes);
app.use('/', appRoutes);

app.get('/', (_req, res) => {
    res.send("Deployment platform backend running 🏃");
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server listening ✅, Port: ${PORT}`);
});