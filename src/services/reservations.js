import { AppError } from '../errors.js';

const MAX_DURATION_MS = 8 * 60 * 60 * 1000;
const MAX_PURPOSE_CHARS = 200;

function cleanPurpose(purpose) {
  return String(purpose ?? '').trim().slice(0, MAX_PURPOSE_CHARS);
}

// Every rule about who may book or change a reservation lives here, so the HTTP routes and MCP tools cannot bypass it.
export function createReservationService({ repo, now = () => new Date() }) {
  function parseRange(startsAt, endsAt) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new AppError(400, 'Start and end must be valid dates and times.');
    }
    if (end <= start) throw new AppError(400, 'The end time must be after the start time.');
    if (end - start > MAX_DURATION_MS) throw new AppError(400, 'A reservation can last at most 8 hours.');
    if (start < now()) throw new AppError(400, 'You cannot reserve a lab in the past.');
    return { start, end };
  }

  async function assertFree(labId, start, end, excludeId) {
    const clash = await repo.findOverlapping({ labId, startsAt: start, endsAt: end, excludeId });
    if (clash) throw new AppError(409, 'This lab is already reserved for part of that time.');
  }

  async function ownedBy(user, id) {
    const reservation = await repo.findReservation(id);
    if (!reservation) throw new AppError(404, 'Reservation not found.');
    if (reservation.user_id !== user.id) throw new AppError(403, 'You can only change your own reservations.');
    return reservation;
  }

  return {
    listLabs: () => repo.listLabs(),

    listMine: (user) => repo.listReservationsForUser(user.id),

    async create(user, { labId, startsAt, endsAt, purpose }) {
      const lab = await repo.findLab(Number(labId));
      if (!lab) throw new AppError(404, 'Lab not found.');
      const { start, end } = parseRange(startsAt, endsAt);
      await assertFree(lab.id, start, end);
      return repo.insertReservation({
        labId: lab.id,
        userId: user.id,
        startsAt: start,
        endsAt: end,
        purpose: cleanPurpose(purpose),
      });
    },

    async update(user, id, changes) {
      const reservation = await ownedBy(user, id);
      let start = reservation.starts_at;
      let end = reservation.ends_at;
      if (changes.startsAt !== undefined || changes.endsAt !== undefined) {
        ({ start, end } = parseRange(changes.startsAt ?? start, changes.endsAt ?? end));
        await assertFree(reservation.lab_id, start, end, reservation.id);
      }
      return repo.updateReservation(reservation.id, {
        startsAt: start,
        endsAt: end,
        purpose: changes.purpose === undefined ? reservation.purpose : cleanPurpose(changes.purpose),
      });
    },

    async cancel(user, id) {
      const reservation = await ownedBy(user, id);
      await repo.deleteReservation(reservation.id);
    },
  };
}
