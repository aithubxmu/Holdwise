import { Router, type IRouter } from "express";
import healthRouter from "./health";
import inboxRouter from "./inbox";

const router: IRouter = Router();

router.use(healthRouter);
router.use(inboxRouter);

export default router;
