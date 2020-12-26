import {ChangeDetectionStrategy, Component, ElementRef, HostListener, OnInit, ViewChild} from '@angular/core';
import { Observable } from 'rxjs';
import { RoutesContextMenu } from 'src/app/components/context-menu/context-menus';
import { ContextMenuEvent } from 'src/app/models/context-menu.model';
import { Settings } from 'src/app/models/settings.model';
import { EnvironmentsService } from 'src/app/services/environments.service';
import { EventsService } from 'src/app/services/events.service';
import { UIService } from 'src/app/services/ui.service';
import { DuplicatedRoutesTypes, EnvironmentsStatuses, Store } from 'src/app/stores/store';
import { Environment, Route } from '@mockoon/commons';
import {map} from 'rxjs/operators';

@Component({
  selector: 'app-routes-menu',
  templateUrl: './routes-menu.component.html',
  styleUrls: ['./routes-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoutesMenuComponent implements OnInit {
  @ViewChild('routesMenu', { static: false }) private routesMenu: ElementRef;
  @ViewChild('searchField', {static: false}) private searchField: ElementRef;

  public settings$: Observable<Settings>;
  public activeEnvironment$: Observable<Environment>;
  public activeEnvironmentRoutes$: Observable<Route []>;

  public activeRoute$: Observable<Route>;
  public environmentsStatus$: Observable<EnvironmentsStatuses>;
  public duplicatedRoutes$: Observable<DuplicatedRoutesTypes>;
  public showSearch$ = false;

  private filter: string;

  constructor(
    private environmentsService: EnvironmentsService,
    private store: Store,
    private eventsService: EventsService,
    private uiService: UIService
  ) {}

  ngOnInit() {
    this.activeEnvironment$ = this.store.selectActiveEnvironment();

    this.activeRoute$ = this.store.selectActiveRoute();
    this.duplicatedRoutes$ = this.store.select('duplicatedRoutes');
    this.environmentsStatus$ = this.store.select('environmentsStatus');
    this.settings$ = this.store.select('settings');

    this.uiService.scrollRoutesMenu.subscribe((scrollDirection) => {
      this.uiService.scroll(this.routesMenu.nativeElement, scrollDirection);
    });

    this.searchRoutes('');
  }

  /**
   * Create a new route in the current environment. Append at the end of the list
   */
  public addRoute() {
    this.environmentsService.addRoute();

    if (this.routesMenu) {
      this.uiService.scrollToBottom(this.routesMenu.nativeElement);
    }
  }

  /**
   * Select a route by UUID, or the first route if no UUID is present
   */
  public selectRoute(routeUUID: string) {
    this.environmentsService.setActiveRoute(routeUUID);
  }

  /**
   * Show and position the context menu
   *
   * @param event - click event
   */
  public openContextMenu(routeUUID: string, event: MouseEvent) {
    // if right click display context menu
    if (event && event.which === 3) {
      const menu: ContextMenuEvent = {
        event: event,
        items: RoutesContextMenu(routeUUID)
      };

      this.eventsService.contextMenuEvents.next(menu);
    }
  }

  /**
   * Apply the filter of the parameter trimmed
   *
   * @param filter The filter as string
   */
  public searchRoutes(filter) {
    this.filter = filter.trim();
    this.filterEnvironmentRoutes();
  }

  /**
   * Listen keypress on the search field
   * - on escape key close the filter
   */
  public searchKeyPress(event: KeyboardEvent) {
    if (event.code === 'Escape') {
      if (this.searchField) {
        this.searchField.nativeElement.blur();
      }

      this.closeSearch(null);
    }
  }

  /**
   * When user clicks on search button show the input field and focus
   */
  public onSearchClick() {
    this.showSearch$ = true;

    setTimeout(() => {
      this.searchField.nativeElement.focus();
    }, 300);
  }

  /**
   * Close the search input field and reset the filter.
   * This function can be called with and without the click event.
   *
   * @param event The click event
   */
  public closeSearch(event: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.showSearch$ = false;
    this.searchField.nativeElement.value = '';
    this.searchRoutes('');
  }

  /**
   * Filter the routes based on this.filter variable and set the filtered values to this.activeEnvironmentRoutes$
   */
  private filterEnvironmentRoutes() {
    const noFilter = typeof this.filter === 'undefined' || this.filter.length === 0;
    this.activeEnvironmentRoutes$ = this.activeEnvironment$.pipe(
      map(value => value.routes
        .filter(r => noFilter || r.endpoint.includes(this.filter))),
    );
  }

}
