import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeRouter from "./analyze/index";
import paymentRouter from "./payment";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeRouter);
router.use(paymentRouter);

export default router;
