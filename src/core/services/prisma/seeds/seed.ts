import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { AdminSeeder } from "./admin.seeder";

/**
 * Interface that all database seeders must implement.
 */
export interface ISeeder {
    name: string;
    seed(prisma: PrismaClient): Promise<void>;
}

export type SeederClass = new () => ISeeder;

/**
 * Registered seeders queue to execute sequentially.
 * To inject/add a new seeder, simply add its class to this array.
 */
const seeders: SeederClass[] = [AdminSeeder];

/**
 * Seeder registry helper for programmatic or static injection.
 */
export class SeederRegistry {
    /**
     * Inject a seeder class into the seeder execution queue.
     */
    public static inject(seederClass: SeederClass): typeof SeederRegistry {
        const exists = seeders.some((s) => s.name === seederClass.name);
        if (!exists) {
            seeders.push(seederClass);
        }
        return this;
    }

    /**
     * Get all registered seeder classes.
     */
    public static getSeeders(): SeederClass[] {
        return [...seeders];
    }

    /**
     * Clear registered seeders.
     */
    public static clear(): void {
        seeders.length = 0;
    }
}

/**
 * Runs all registered database seeders.
 */
export async function runSeeders(): Promise<void> {
    console.log("🌱 Starting Database Seeding...");
    const startTime = Date.now();

    const prisma = new PrismaClient();

    if (seeders.length === 0) {
        console.log("⚠️ No seeders registered in SeederRegistry.");
        await prisma.$disconnect();
        return;
    }

    try {
        await prisma.$connect();

        for (const SeederClass of seeders) {
            const seeder = new SeederClass();
            console.log(`\n▶ Running ${seeder.name}...`);
            await seeder.seed(prisma);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(
            `\n✨ Database Seeding Completed Successfully in ${elapsed}s!\n`,
        );
    } catch (error) {
        console.error("❌ Error during database seeding:", error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Execute when run directly via CLI (e.g. ts-node src/core/services/prisma/seeds/seed.ts or prisma db seed)
if (require.main === module) {
    runSeeders()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Seed process failed:", error);
            process.exit(1);
        });
}
