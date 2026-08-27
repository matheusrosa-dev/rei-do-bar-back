import { randomUUID } from "node:crypto";
import Chance from "chance";

export const chance = new Chance("rei-do-bar");

const firstNames = [
  "Ana",
  "Beatriz",
  "Camila",
  "Carla",
  "Daniela",
  "Fernanda",
  "Gabriela",
  "Helena",
  "Isabela",
  "Juliana",
  "Larissa",
  "Mariana",
  "Patrícia",
  "Renata",
  "Tatiane",
  "Vanessa",
  "André",
  "Bruno",
  "Carlos",
  "Diego",
  "Eduardo",
  "Felipe",
  "Gustavo",
  "Henrique",
  "João",
  "Lucas",
  "Marcelo",
  "Rafael",
  "Rodrigo",
  "Thiago",
  "Vinícius",
  "Wellington",
];

const lastNames = [
  "Almeida",
  "Barbosa",
  "Cardoso",
  "Carvalho",
  "Costa",
  "Dias",
  "Ferreira",
  "Gomes",
  "Lima",
  "Martins",
  "Mendes",
  "Moreira",
  "Nunes",
  "Oliveira",
  "Pereira",
  "Ribeiro",
  "Rocha",
  "Rodrigues",
  "Santos",
  "Silva",
  "Souza",
  "Teixeira",
];

const streets = [
  "Rua Augusta",
  "Rua da Consolação",
  "Rua Vergueiro",
  "Rua Teodoro Sampaio",
  "Rua Domingos de Morais",
  "Rua Clélia",
  "Rua Turiassu",
  "Rua Cardeal Arcoverde",
  "Rua Aurora",
  "Rua Voluntários da Pátria",
  "Avenida Paulista",
  "Avenida Ipiranga",
  "Avenida Rebouças",
  "Avenida Santo Amaro",
  "Avenida Celso Garcia",
  "Avenida Sapopemba",
  "Travessa dos Ourives",
  "Alameda Santos",
];

const neighborhoods = [
  "Bela Vista",
  "Pinheiros",
  "Vila Madalena",
  "Perdizes",
  "Tatuapé",
  "Mooca",
  "Santana",
  "Ipiranga",
  "Butantã",
  "Lapa",
  "Saúde",
  "Vila Mariana",
  "Itaquera",
  "Campo Belo",
];

const complements = [
  "Apto 12",
  "Apto 34B",
  "Bloco 2, apto 71",
  "Casa 3",
  "Fundos",
  "Sobrado",
];

const cancellationReasons = [
  "Cliente não atendeu o interfone.",
  "Endereço não localizado pelo entregador.",
  "Produto em falta no estoque.",
  "Cliente solicitou o cancelamento.",
  "Pagamento não confirmado.",
  "Fora da área de entrega.",
];

export function fullName() {
  return `${chance.pickone(firstNames)} ${chance.pickone(lastNames)} ${chance.pickone(lastNames)}`;
}

export function streetName() {
  return chance.pickone(streets);
}

export function neighborhoodName() {
  return chance.pickone(neighborhoods);
}

export function complementName() {
  return chance.pickone(complements);
}

export function cancellationReason() {
  return chance.pickone(cancellationReasons);
}

export function digits(length: number) {
  return chance.string({ length, pool: "0123456789" });
}

export function uniqueDigits(length: number, used: Set<string>) {
  let value = digits(length);

  while (used.has(value)) {
    value = digits(length);
  }

  used.add(value);

  return value;
}

export function id() {
  return randomUUID();
}

export function minutesAgo(minutes: number, from: Date = new Date()) {
  return new Date(from.getTime() - minutes * 60 * 1000);
}

export function hoursAgo(hours: number, from: Date = new Date()) {
  return minutesAgo(hours * 60, from);
}

export function daysAgo(days: number, from: Date = new Date()) {
  return minutesAgo(days * 24 * 60, from);
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function addDays(date: Date, days: number) {
  return addMinutes(date, days * 24 * 60);
}

export function dateBetween(start: Date, end: Date) {
  return new Date(chance.integer({ min: start.getTime(), max: end.getTime() }));
}

export function formatOrderAddress(address: {
  street: string;
  number: string;
  neighborhood: string;
  zipCode: string;
}) {
  return `${address.street}, ${address.number} - ${address.neighborhood}/${address.zipCode}`;
}

export function pickDistinct<T>(items: T[], count: number) {
  return chance.pickset(items, Math.min(count, items.length));
}

export function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
