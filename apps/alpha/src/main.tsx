import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { TabProvider } from './context/TabContext';
import { AliveScope } from 'react-activation';

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <AliveScope>
    <TabProvider>
      <RouterProvider router={router} />
    </TabProvider>
  </AliveScope>,
);
