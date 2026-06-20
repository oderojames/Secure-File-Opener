import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeRouter from "./analyze/index";
import paymentRouter from "./payment";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeRouter);
router.use(paymentRouter);
router.use(chatRouter);

export default router;
