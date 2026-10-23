import { Router, type IRouter } from "express";
import healthRouter from "./health";
import inboxRouter from "./inbox";
import quotesRouter from "./quotes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(inboxRouter);
router.use(quotesRouter);

export default router;
