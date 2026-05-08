import { HttpException, HttpStatus } from "@nestjs/common";
import { ArgumentsHost } from "@nestjs/common";
import { GlobalExceptionFilter } from "../exception.filter";
import { AppException } from "../../exceptions/app.exception";

const makeResponse = () => {
  const json = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json };
};

const makeHost = (response: ReturnType<typeof makeResponse>): ArgumentsHost => {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
};

describe("GlobalExceptionFilter", () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
  });

  it("should be defined", () => {
    expect(filter).toBeDefined();
  });

  describe("when the exception is an AppException", () => {
    it("should respond with the exception status, code and message", () => {
      const response = makeResponse();
      const host = makeHost(response);

      const exception = new AppException(
        AppException.errorCodes.cart.PRODUCT_NOT_FOUND,
        "Produto não encontrado",
        HttpStatus.NOT_FOUND,
      );

      filter.catch(exception, host);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(response.json).toHaveBeenCalledWith({
        code: "CART_001",
        message: "Produto não encontrado",
      });
    });
  });

  describe("when the exception is a generic HttpException", () => {
    it("should respond with UNKNOWN code when body has no code field", () => {
      const response = makeResponse();
      const host = makeHost(response);

      const exception = new HttpException(
        { message: "Forbidden" },
        HttpStatus.FORBIDDEN,
      );

      filter.catch(exception, host);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(response.json).toHaveBeenCalledWith({
        code: "UNKNOWN",
        message: "Forbidden",
      });
    });

    it("should respond with code from the body when present", () => {
      const response = makeResponse();
      const host = makeHost(response);

      const exception = new HttpException(
        { code: "CUSTOM_CODE", message: "Custom error" },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      filter.catch(exception, host);

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
      expect(response.json).toHaveBeenCalledWith({
        code: "CUSTOM_CODE",
        message: "Custom error",
      });
    });
  });

  describe("when the exception is an unknown error", () => {
    it("should respond with 500 and INTERNAL_ERROR code", () => {
      const response = makeResponse();
      const host = makeHost(response);

      filter.catch(new Error("something went wrong"), host);

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(response.json).toHaveBeenCalledWith({
        code: "INTERNAL_ERROR",
        message: "Erro interno do servidor",
      });
    });

    it("should respond with 500 when exception is a plain object", () => {
      const response = makeResponse();
      const host = makeHost(response);

      filter.catch({ unexpected: true }, host);

      expect(response.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(response.json).toHaveBeenCalledWith({
        code: "INTERNAL_ERROR",
        message: "Erro interno do servidor",
      });
    });
  });
});
