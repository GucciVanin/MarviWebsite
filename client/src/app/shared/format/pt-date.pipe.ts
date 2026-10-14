import { Pipe, PipeTransform } from '@angular/core';

const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** A timestamp from the API as a Brazilian date and time (dd/mm/aaaa hh:mm), in the viewer's time zone. */
@Pipe({ name: 'ptDate' })
export class PtDatePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : formatter.format(date);
  }
}
