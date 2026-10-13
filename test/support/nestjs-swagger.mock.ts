const noopDecorator = () => () => undefined;

export const ApiOkResponse = noopDecorator;
export const ApiBody = noopDecorator;
export const ApiExtraModels = noopDecorator;
export const getSchemaPath = (model: { name: string }) =>
  `#/components/schemas/${model.name}`;

export class DocumentBuilder {
  setTitle() {
    return this;
  }
  setDescription() {
    return this;
  }
  setVersion() {
    return this;
  }
  addBearerAuth() {
    return this;
  }
  build() {
    return {};
  }
}

export class SwaggerModule {
  static createDocument() {
    return {};
  }
  static setup() {}
}
