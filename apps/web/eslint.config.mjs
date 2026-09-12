import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([{
    extends: [...nextCoreWebVitals],
    rules: {
        // The React Compiler is not enabled. These rules flag intentional fetched-data,
        // portal, and React Hook Form synchronization used by this application.
        "react-hooks/incompatible-library": "off",
        "react-hooks/set-state-in-effect": "off",
    },
}]);
