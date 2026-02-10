import { StockManager } from "./src/core/StockManager";
import { presentStockWidget } from "./src/components/StockWidget";

async function main() {
    console.log("Starting widget test...");
    try {
        const data = await StockManager.getDisplayData();
        console.log("Data fetched successfully:", data.length, "stocks");
        // We can't easily present the widget in a test script without UI environment, 
        // but importing the modules confirms no syntax errors like 'zhuoimport'.
        console.log("Modules imported successfully. No 'zhuoimport' error found.");
    } catch (error) {
        console.error("Test failed:", error);
    }
}

main();
