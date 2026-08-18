export interface MockPrismaModel {
  findUnique: jest.Mock;
  findUniqueOrThrow: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  create: jest.Mock;
  createMany: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
  count: jest.Mock;
}

export interface MockPrismaService {
  user: MockPrismaModel;
  verificationToken: MockPrismaModel;
  course: MockPrismaModel;
  courseMember: MockPrismaModel;
  deadline: MockPrismaModel;
  checklistItem: MockPrismaModel;
  $transaction: jest.Mock;
}

function createMockModel(): MockPrismaModel {
  return {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  };
}

/**
 * A hand-rolled mock of PrismaService covering only the models/methods this
 * app uses. `$transaction` supports both the interactive-callback form and
 * the array-of-queries form used across the services.
 */
export function createMockPrismaService(): MockPrismaService {
  const mock = {
    user: createMockModel(),
    verificationToken: createMockModel(),
    course: createMockModel(),
    courseMember: createMockModel(),
    deadline: createMockModel(),
    checklistItem: createMockModel(),
  } as MockPrismaService;

  mock.$transaction = jest.fn(
    (arg: unknown[] | ((tx: MockPrismaService) => unknown)) => {
      if (typeof arg === 'function') {
        return arg(mock);
      }
      return Promise.all(arg);
    },
  );

  return mock;
}
