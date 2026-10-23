import { Router, type IRouter } from "express";
import healthRouter from "./health";
import inboxRouter from "./inbox";
import quotesRouter from "./quotes";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(inboxRouter);
router.use(quotesRouter);
router.use(settingsRouter);

export default router;
