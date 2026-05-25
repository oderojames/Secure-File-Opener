import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeRouter from "./analyze/index";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeRouter);

export default router;
