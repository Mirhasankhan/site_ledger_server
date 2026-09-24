import "tsconfig-paths/register";
import { ConsoleLogger, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "@/app/app.module";
import type { Request, Response } from "express";
import * as express from "express";
import config from "./config";

import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";


async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        logger: new ConsoleLogger({
            prefix: "siteledger-server",
            logLevels: ["error", "warn", "fatal"],
            timestamp: true,
            json: true,
        }),
        rawBody: true,
    });

    // --- Middlewares & Config ---
    app.use(cookieParser());
    app.use("/api/v1/webhook", express.raw({ type: "application/json" }));
    app.setGlobalPrefix("api/v1");

    // --- CORS ---
    app.enableCors({
        origin: ["http://localhost:3000", "https://siteledger-frontend-iota.vercel.app"],
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "Access-Control-Allow-Origin",
        ],
    });

    // --- Health Check ---
    const nativeApp = app.getHttpAdapter().getInstance();
    nativeApp.get("/", (req: Request, res: Response) => {
        res.send({
            success: true,
            message: "El Psy Congroo!",
            server_name: "building-management-system",
            server_type: "WEB",
        });
    });

    // --- Global Pipes ---
    app.useGlobalPipes(
        new ValidationPipe({
            disableErrorMessages: false,
            whitelist: true,
            forbidNonWhitelisted: false,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
        }),
    );

    // --- Swagger Doc - Dev server only ---
    if (config.env !== "production") {
        const swaggerConfig = new DocumentBuilder()
            .setTitle("Building Management System API")
            .setDescription(
                "The API Description for Building Management System",
            )
            .setVersion("1.0")
            .addBearerAuth(
                {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                    name: "Authorization",
                    description: "Enter JWT token",
                    in: "header",
                },
                "accessToken",
            )
            .build();

        const document = SwaggerModule.createDocument(app, swaggerConfig);
        document.security = [{ accessToken: [] }];
        SwaggerModule.setup("docs", app, document);
    }

    if (process.env.VERCEL !== "1") {
        const port = config.port || 5000;
        await app.listen(port);
        console.log(`\n🚀 Application is running on http://localhost:${port}`);
    } else {
        await app.init();
    }

    return app;
}

export default async function handler(req: Request, res: Response) {
    const app = await bootstrap();
    const expressApp = app.getHttpAdapter().getInstance();

    expressApp(req, res);
}

if (process.env.VERCEL !== "1") {
    bootstrap();
}
