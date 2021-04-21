import { Except, SetOptional } from 'type-fest';
import { Condition } from './condition';
import { DbTypes, DSL } from './dsl/dsl';
import { DSLContext } from './dsl/dsl.context';
import { Fetchable } from './dsl/fetchable';
import { Field } from './dsl/field';
import { OrderField } from './dsl/order';
import { TableWithFields } from './table';
import { FieldsForType, Page, Subset } from './types';

export interface FetchOptions {
  page?: Page;
  order?: OrderField<any>[];
}

export class CrudRepository<T, PK extends keyof T> {
  private readonly tableWithoutPK: TableWithFields<Except<T, PK>>;
  constructor(
    public readonly create: DSLContext,
    public readonly tableDefinition: TableWithFields<T>,
    public readonly primaryKey: PK,
  ) {
    this.tableWithoutPK = DSL.withoutFields(tableDefinition, primaryKey);
  }

  get primaryKeyField(): Field<T[PK], DbTypes> {
    return this.tableDefinition.fields[this.primaryKey];
  }
  public async findAll(options?: FetchOptions): Promise<T[]> {
    return this.create
      .selectFrom<T>(this.tableDefinition)
      .orderBy(options?.order)
      .limit(options?.page)
      .fetch();
  }

  private removeUnmatchingFieldsAndCopyIfNecessary<ObjectType>(
    object: ObjectType,
    fields: FieldsForType<ObjectType>,
  ): ObjectType {
    if (Object.keys(object).find((key) => !fields[key as keyof ObjectType])) {
      const clonedObj: any = {};
      for (const key in fields) {
        clonedObj[key] = (object as any)[key];
      }
      return clonedObj as ObjectType;
    }
    return object;
  }

  public async insertAutoGenerated(object: Except<T, PK>): Promise<T> {
    object = this.removeUnmatchingFieldsAndCopyIfNecessary<Except<T, PK>>(
      object,
      this.tableWithoutPK.fields,
    );
    const o = this.create
      .insertInto(this.tableWithoutPK, [object])
      .returning(this.tableDefinition.fields)
      .fetchOneOrThrow();
    return (o as unknown) as T;
  }

  public async insertAllAutoGenerated(objects: Except<T, PK>[]): Promise<T[]> {
    const convertedObjects: Except<T, PK>[] = objects.map((object) =>
      this.removeUnmatchingFieldsAndCopyIfNecessary<Except<T, PK>>(
        object,
        this.tableWithoutPK.fields,
      ),
    );
    return (this.create
      .insertInto(this.tableWithoutPK, convertedObjects)
      .returning(this.tableDefinition.fields)
      .fetch() as unknown) as T[];
  }

  public async insert(object: T): Promise<T> {
    return this.create
      .insertInto(this.tableDefinition, [object])
      .returning()
      .fetchOneOrThrow();
  }
  public async insertAll(objects: T[]): Promise<T[]> {
    return this.create
      .insertInto(this.tableDefinition, objects)
      .returning()
      .fetch();
  }

  public async insertOnConflictUpdate(object: T): Promise<T> {
    return this.create
      .insertInto(this.tableDefinition, [object])
      .onConflict(this.primaryKey)
      .doUpdate()
      .setExcluded()
      .returning()
      .fetchOneOrThrow();
  }
  public async insertAllOnConflictUpdate(objects: T[]): Promise<T[]> {
    return this.create
      .insertInto(this.tableDefinition, objects)
      .onConflict(this.primaryKey)
      .doUpdate()
      .setExcluded()
      .returning()
      .fetch();
  }
  public async insertAllAutoGeneratedOnConflictUpdate(
    objects: Except<T, PK>[],
    conflictingField: keyof Except<T, PK>,
  ): Promise<Except<T, PK>[]> {
    const convertedObjects: Except<T, PK>[] = objects.map((object) =>
      this.removeUnmatchingFieldsAndCopyIfNecessary<Except<T, PK>>(
        object,
        this.tableWithoutPK.fields,
      ),
    );

    return this.create
      .insertInto(this.tableWithoutPK, convertedObjects)
      .onConflict(conflictingField)
      .doUpdate()
      .setExcluded()
      .returning()
      .fetch();
  }
  public async insertOnConflictDoNothing(object: T): Promise<T> {
    return this.create
      .insertInto(this.tableDefinition, [object])
      .onConflict(this.primaryKey)
      .doNothing()
      .returning()
      .fetchOneOrThrow();
  }
  public async insertAllOnConflictDoNothing(objects: T[]): Promise<T[]> {
    return this.create
      .insertInto(this.tableDefinition, objects)
      .onConflict(this.primaryKey)
      .doNothing()
      .returning()
      .fetch();
  }

  getWhereClauseForId(id: T[PK]): Condition {
    return this.tableDefinition.fields[this.primaryKey].eq(id as any);
  }

  public async update<K extends keyof T>(
    id: T[PK],
    object: Subset<T, K>,
  ): Promise<T> {
    return (await this.create
      .update(this.tableDefinition, object)
      .where(this.getWhereClauseForId(id))
      .returning(this.tableDefinition.fields)
      .fetchOneOrThrow()) as T;
  }

  public async findOneById(id: T[PK]): Promise<T | undefined> {
    return this.create
      .selectFrom(this.tableDefinition)
      .where(this.getWhereClauseForId(id))
      .fetchOne();
  }

  public async findOneByIdOrThrow(id: T[PK]): Promise<T> {
    return this.create
      .selectFrom(this.tableDefinition)
      .where(this.getWhereClauseForId(id))
      .fetchOneOrThrow();
  }
  public async find(
    conditions: Condition[] | Condition,
    options?: FetchOptions,
  ): Promise<T[]> {
    if (!Array.isArray(conditions)) {
      conditions = [conditions];
    }
    return this.create
      .selectFrom(this.tableDefinition)
      .where(conditions)
      .orderBy(options?.order)
      .limit(options?.page)
      .fetch();
  }

  public async findFirst(
    conditions: Condition[] | Condition,
    orderBy?: OrderField<any>[],
  ): Promise<T> {
    return (await this.find(conditions, { order: orderBy }))[0];
  }

  public async findByIdsIn(
    ids: Array<T[PK]> | Fetchable<T[PK]>,
    options?: FetchOptions,
  ): Promise<T[]> {
    const where = this.primaryKeyField.in(ids);
    return this.create
      .selectFrom(this.tableDefinition)
      .where(where)
      .orderBy(options?.order)
      .limit(options?.page)
      .fetch();
  }
  public selectByIdsIn(ids: Array<T[PK]> | Fetchable<T[PK]>): Fetchable<T> {
    const where = this.primaryKeyField.in(ids);
    return this.create.selectFrom(this.tableDefinition).where(where);
  }

  public select() {
    return this.create.selectFrom(this.tableDefinition);
  }

  public selectId() {
    return this.create
      .select(this.tableDefinition.fields[this.primaryKey])
      .from(this.tableDefinition.table);
  }

  public async deleteById(id: T[PK]): Promise<number> {
    return await this.create
      .delete(this.tableDefinition.table)
      .where(this.getWhereClauseForId(id))
      .execute();
  }
  public async delete(conditions: Condition | Condition[]): Promise<number> {
    if (!Array.isArray(conditions)) {
      conditions = [conditions];
    }
    return await this.create
      .delete(this.tableDefinition.table)
      .where(conditions)
      .execute();
  }

  async fetchOneToOne<ReferenceKey extends keyof T>(
    ids: T[ReferenceKey][],
    referenceKey: ReferenceKey,
    field: Field<T[ReferenceKey]>,
    conditions: Condition | Condition[],
  ): Promise<Array<T | undefined>> {
    if (!Array.isArray(conditions)) {
      conditions = [conditions];
    }
    conditions.push(field.in(ids));
    const list = await this.find(conditions);
    const map = new Map<T[ReferenceKey], T>();
    list.forEach((item) => {
      const referenceValue = item[referenceKey];
      map.set(referenceValue, item);
    });
    return ids.map((id) => map.get(id));
  }

  public async fetchOneToMany<ReferenceKey extends keyof T>(
    ids: T[ReferenceKey][],
    referenceKey: ReferenceKey,
    field: Field<T[ReferenceKey]>,
    conditions: Condition | Condition[],
  ): Promise<Array<T[]>> {
    if (!Array.isArray(conditions)) {
      conditions = [conditions];
    }
    conditions.push(field.in(ids));
    const list = await this.find(conditions);
    const map = new Map<T[ReferenceKey], T[]>();
    list.forEach((item) => {
      const referenceValue = item[referenceKey];
      const mapItem = map.get(item[referenceKey]);
      if (!mapItem) {
        map.set(referenceValue, [item]);
      } else {
        mapItem.push(item);
      }
    });
    return ids.map((id) => map.get(id) || []);
  }

  public async fetchMap(
    conditions: Condition | Condition[],
    options?: FetchOptions,
  ): Promise<Map<T[PK], T>> {
    const list = await this.find(conditions, options);
    const map = new Map<T[PK], T>();
    list.forEach((item) => map.set(item[this.primaryKey], item));
    return map;
  }

  public async insertOrUpdate(object: SetOptional<T, PK>): Promise<T> {
    const pk: T[PK] | undefined = (object as any)[this.primaryKey];
    if (pk === undefined) {
      return this.insertAutoGenerated(
        (object as unknown) as Pick<T, Exclude<keyof T, PK>>,
      );
    } else {
      return this.update(pk, object);
    }
  }
}
