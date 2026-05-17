import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API para buscar dados do Banco Central (SGS)
  // Série 433: IPCA Mensal
  // Série 1178: SELIC acumulada no mês (anualizada)
  app.get("/api/indices", async (req, res) => {
    try {
      const { dataInicial, dataFinal } = req.query;
      
      // IPCA
      const ipcaResponse = await fetch(
        `https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=${dataInicial}&dataFinal=${dataFinal}`
      );
      const ipcaData = await ipcaResponse.json();

      // SELIC
      const selicResponse = await fetch(
        `https://api.bcb.gov.br/dados/serie/bcdata.sgs.1178/dados?formato=json&dataInicial=${dataInicial}&dataFinal=${dataFinal}`
      );
      const selicData = await selicResponse.json();

      res.json({ ipca: ipcaData, selic: selicData });
    } catch (error) {
      console.error("Erro ao buscar índices:", error);
      res.status(500).json({ error: "Erro ao buscar dados do Banco Central" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
