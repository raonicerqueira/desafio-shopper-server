import { Request, Response, Router } from "express";
import { Readable } from "stream";
import readline from "readline";

import multer from "multer";
import { client } from "./database/client";

const multerConfig = multer();

const router = Router();

interface ProductToUpdate {
  product_code: string;
  product_name: string | undefined;
  product_actual_price: string | undefined;
  new_price: string;
  validation: {
    empty_fields?: boolean;
    invalid_product_code?: boolean;
    invalid_product_price?: boolean;
    price_below_cost?: boolean;
    overvalued_new_price?: boolean;
  };
}

router.post(
  "/products",
  multerConfig.single("csvFile"),
  async (request: Request, response: Response) => {
    const dbProducts = await client.products.findMany();
    const dbProductsCodesList = dbProducts.map((product) => {
      return product.code.toString();
    });

    const buffer = request.file?.buffer;

    const readableFile = new Readable();
    readableFile.push(buffer);
    readableFile.push(null);

    const productsLine = readline.createInterface({
      input: readableFile,
    });

    const productsToUpdate: ProductToUpdate[] = [];

    for await (let line of productsLine) {
      const productsLineSplit = line.split(",");

      const product_code = productsLineSplit[0];
      const new_price = productsLineSplit[1];

      const empty_fields = !product_code && !new_price;
      const invalid_product_code = !dbProductsCodesList.includes(product_code);
      const currencyPattern = /^\d+(?:\.\d{0,2})$/;
      const invalid_product_price = !currencyPattern.test(new_price);

      const currentProduct = dbProducts.find(
        (product) => Number(product.code) === Number(product_code)
      );

      const product_name = currentProduct?.name;

      const product_actual_price = currentProduct?.sales_price.toString();

      const price_below_cost =
        Number(new_price) < Number(currentProduct?.cost_price);

      const overvalued_new_price =
        parseFloat(new_price) > Number(currentProduct?.sales_price) * 1.1 ||
        parseFloat(new_price) < Number(currentProduct?.sales_price) * 0.9;

      productsToUpdate.push({
        product_code,
        product_name,
        product_actual_price,
        new_price,
        validation: {
          empty_fields,
          invalid_product_code,
          invalid_product_price,
          price_below_cost,
          overvalued_new_price,
        },
      });
    }

    productsToUpdate[0].product_code == "product_code" &&
      productsToUpdate[0].new_price == "new_price" &&
      productsToUpdate.shift();

    return response.json(productsToUpdate);
  }
);

router.put("/updatePrices", async (request: Request, response: Response) => {
  try {
    const { validProducts } = request.body;

    for (const product of validProducts) {
      await client.products.update({
        where: { code: product.product_code },
        data: { sales_price: product.new_price },
      });
    }

    response.status(200).json({ message: "Preços atualizados com sucesso" });
  } catch (error) {
    response.status(500).json({ error: "Erro interno do servidor" });
  } finally {
    await client.$disconnect();
  }
});

export { router };
