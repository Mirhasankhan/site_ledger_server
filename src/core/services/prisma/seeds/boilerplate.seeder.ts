/* eslint-disable @typescript-eslint/no-unused-vars */

import { PrismaClient } from "@prisma/client";
import { ISeeder } from "./seed";

export class BoilerplateSeeder implements ISeeder {
    name = "BoilerplateSeeder";

    async seed(prisma: PrismaClient): Promise<void> {
        // Do whatever seeding needs to be done
        // Inject the BoilerplateSeeder to seed.ts - Line 19 (`seeders`)
    }
}
