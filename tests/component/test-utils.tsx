import React, { type ReactElement } from "react";

import { HeroUIProvider } from "@heroui/react";
import { render } from "@testing-library/react";

export const renderWithUi = (ui: ReactElement) =>
  render(<HeroUIProvider>{ui}</HeroUIProvider>);
