
	
/* --------------------------------------------------
	Initialization
-------------------------------------------------- */

    // Initialize all functions when the document is ready.
	$(document).ready(function(){
		initResize();
		initScroller();
		initAnimation();
		initTimeline();
		initOpenSource();
		initNav();
		initDesignLightbox();
		initCountUp();
		initAnalytics();
		$('.testimonial-track, .project-track').each(function(){ initSlider(this); });
	});


/* --------------------------------------------------
	Analytics: report key visitor actions to GA4 (no-op until GA_ID is set in index.html)
-------------------------------------------------- */

	function initAnalytics () {
		function track (name, params) {
			if (typeof gtag === 'function') gtag('event', name, params);
		}

		$(document).on('click', 'a[href]', function () {
			var href = this.getAttribute('href');
			var area = $(this).closest('section[id], header, footer')[0];
			var where = area ? (area.id || area.tagName.toLowerCase()) : 'page';

			if (/\.pdf$/i.test(href)) track('cv_download', { link_location: where });
			else if (href.indexOf('mailto:') === 0) track('contact_click', { method: 'email', link_location: where });
			else if (href.indexOf('tel:') === 0) track('contact_click', { method: 'phone', link_location: where });
			else if (this.hostname && this.hostname !== location.hostname) track('outbound_click', { link_url: this.href, link_location: where });
		});

		// Which sections visitors actually reach
		if (!('IntersectionObserver' in window)) return;
		var observer = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				if (!entry.isIntersecting) return;
				track('section_view', { section: entry.target.id });
				observer.unobserve(entry.target);
			});
		}, { threshold: 0.4 });
		$('#page-content > section[id]').each(function () { observer.observe(this); });
	}


/* --------------------------------------------------
	Sliders (testimonials, projects): native scroll-snap, arrows and optional dots page through it
-------------------------------------------------- */

	function initSlider (track) {
		var slider = $(track).closest('.testimonial-slider, .project-slider')[0];
		var dots = slider.querySelector('.testimonial-dots');
		var prev = slider.querySelector('[data-dir="-1"]');
		var next = slider.querySelector('[data-dir="1"]');

		function pageCount () {
			return Math.max(1, Math.ceil((track.scrollWidth - 1) / track.clientWidth));
		}

		function currentPage () {
			if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 2) return pageCount() - 1;
			return Math.round(track.scrollLeft / track.clientWidth);
		}

		function goTo (page) {
			var cards = track.children;
			var perPage = Math.max(1, Math.round(track.clientWidth / cards[0].offsetWidth));
			var card = cards[Math.max(0, Math.min(cards.length - 1, page * perPage))];
			track.scrollTo({ left: card.offsetLeft - cards[0].offsetLeft, behavior: 'smooth' });
		}

		function buildDots () {
			if (!dots) return update();
			dots.innerHTML = '';
			for (var i = 0; i < pageCount(); i++) {
				var b = document.createElement('button');
				b.type = 'button';
				b.setAttribute('aria-label', 'Go to page ' + (i + 1));
				b.addEventListener('click', goTo.bind(null, i));
				dots.appendChild(b);
			}
			update();
		}

		function update () {
			var page = currentPage();
			if (dots) $(dots).children().each(function (i) { $(this).toggleClass('active', i === page); });
			prev.disabled = page === 0;
			next.disabled = page >= pageCount() - 1;
		}

		$([prev, next]).on('click', function () {
			goTo(currentPage() + parseInt(this.getAttribute('data-dir'), 10));
		});
		track.addEventListener('scroll', update, { passive: true });
		$(window).on('resize', buildDots);
		buildDots();
	}


/* --------------------------------------------------
	Impact numbers: count up when scrolled into view
-------------------------------------------------- */

	function initCountUp () {
		var els = $('[data-count]');
		if (!els.length || !('IntersectionObserver' in window)) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		function run (el) {
			var target = parseFloat(el.getAttribute('data-count'));
			var decimals = (el.getAttribute('data-count').split('.')[1] || '').length;
			var start = null, duration = 1600;
			function step (t) {
				if (!start) start = t;
				var p = Math.min((t - start) / duration, 1);
				var eased = 1 - Math.pow(1 - p, 3);
				el.textContent = format(target * eased);
				if (p < 1) requestAnimationFrame(step);
			}
			function format (n) {
				return n.toLocaleString('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
			}
			requestAnimationFrame(step);
			// Always land on the exact value, even if frames are throttled (background tab, slow device)
			setTimeout(function(){ el.textContent = format(target); }, duration + 100);
		}

		var observer = new IntersectionObserver(function(entries){
			entries.forEach(function(entry){
				if (entry.isIntersecting) {
					run(entry.target);
					observer.unobserve(entry.target);
				}
			});
		}, {threshold: .6});
		els.each(function(){ observer.observe(this); });
	}


/* --------------------------------------------------
	Design Background lightbox
-------------------------------------------------- */

	function initDesignLightbox () {
		var box = $('#design-lightbox');
		if (!box.length) return;
		// One entry per design, taken from the first (visible) copy of the first row
		var items = $('.marquee-row').first().find('.design-tile:not([aria-hidden])').map(function(){
			return {
				src: $(this).find('img').attr('src'),
				title: $(this).find('strong').text(),
				kind: $(this).find('em').text()
			};
		}).get();
		var current = 0, lastFocus = null;

		function show (i) {
			current = (i + items.length) % items.length;
			var item = items[current];
			box.find('img').attr({src: item.src, alt: item.title + ' – ' + item.kind});
			box.find('figcaption strong').text(item.title);
			box.find('figcaption em').text(item.kind);
		}
		function open (i) {
			lastFocus = document.activeElement;
			show(i);
			box.prop('hidden', false);
			requestAnimationFrame(function(){ box.addClass('open'); });
			$('body').css('overflow', 'hidden');
			box.find('.lightbox-close').trigger('focus');
		}
		function close () {
			box.removeClass('open');
			setTimeout(function(){ box.prop('hidden', true); }, 250);
			$('body').css('overflow', '');
			if (lastFocus) lastFocus.focus();
		}

		$('.design-tile').on('click', function(){ open(+$(this).data('index')); });
		box.find('.lightbox-close').on('click', close);
		box.find('.lightbox-prev').on('click', function(){ show(current - 1); });
		box.find('.lightbox-next').on('click', function(){ show(current + 1); });
		box.on('click', function(e){ if (e.target === this) close(); });
		$(document).on('keydown', function(e){
			if (box.prop('hidden')) return;
			if (e.key === 'Escape') close();
			if (e.key === 'ArrowLeft') show(current - 1);
			if (e.key === 'ArrowRight') show(current + 1);
		});
	}


/* --------------------------------------------------
	Fixed Nav
-------------------------------------------------- */

	function initNav () {
		var menu = $('#menu');
		var links = menu.find('.nav li:not(.nav-cta) a[href^="#"]');

		function update () {
			var scroll = $(window).scrollTop();
			menu.toggleClass('at-top', scroll <= 50);

			// Highlight the last section whose top has passed under the nav.
			var current = links.first();
			links.each(function(){
				var target = $($(this).attr('href'));
				if (target.length && target.offset().top - menu.outerHeight() - 10 <= scroll) {
					current = $(this);
				}
			});
			links.parent().removeClass('active');
			current.parent().addClass('active');
		}

		links.add('.header-cta a[href^="#"]').on('click', function(e){
			var target = $($(this).attr('href'));
			if (!target.length) return;
			e.preventDefault();
			var top = $(this).attr('href') === '#page-top' ? 0 : target.offset().top - menu.outerHeight() + 1;
			$('html, body').stop().animate({scrollTop: top}, 600);
			menu.find('.navbar-collapse.in').collapse('hide');
		});

		$(window).on('scroll resize', update);
		update();
	}


/* --------------------------------------------------
	Scroll Nav
-------------------------------------------------- */

	function initScroller () {
		$('#scroll-page-content a').on('click', function(e){
			e.preventDefault();
			$('html, body').stop().animate({scrollTop: $('#page-content').offset().top - $('#menu').outerHeight() + 1}, 600);
		});
		$('.footer-top').on('click', function(e){
			e.preventDefault();
			$('html, body').stop().animate({scrollTop: 0}, 600);
		});
	}


/* --------------------------------------------------
	Animation
-------------------------------------------------- */

	function initAnimation () {
		new WOW().init();
	}


	
/* --------------------------------------------------
	Experience: collapse earlier roles
-------------------------------------------------- */

	function initTimeline () {
		var timeline = $('.cbp_tmtimeline');
		var toggle = $('.timeline-toggle');
		if (!timeline.length) return;

		// Show the first 3 bullets of each job; the rest sit behind "Show more".
		timeline.find('.cbp_tmlabel > ul').each(function(){
			var list = $(this);
			var extra = list.children('li').slice(3);
			if (!extra.length) return;
			extra.addClass('is-extra');
			$('<button type="button" class="timeline-more" aria-expanded="false">Show more <i class="fa fa-chevron-down"></i></button>')
				.insertAfter(list)
				.on('click', function(){
					var open = list.toggleClass('is-open').hasClass('is-open');
					$(this).attr('aria-expanded', open).contents().first()[0].textContent = open ? 'Show less ' : 'Show more ';
					stagger();
				});
		});

		// Pull each card up beside the previous one, as long as it clears the
		// last card on its own side and its dot stays below the previous dot.
		function stagger () {
			var items = timeline.children('li').filter(':visible');
			items.css('margin', '');
			if (window.innerWidth < 768) return;
			var gap = 24, minStep = 90, sideBottom = [0, 0], top = 0, prevTop = -minStep, prevBottom = 0;
			items.each(function(i){
				var side = i % 2;
				top = Math.max(prevTop + minStep, sideBottom[side] + gap);
				$(this).css({ marginTop: top - prevBottom, marginBottom: 0 });
				prevTop = top;
				prevBottom = top + this.offsetHeight;
				sideBottom[side] = prevBottom;
			});
		}
		$(window).on('resize load', stagger);
		stagger();

		if (!timeline.find('li.is-older').length) return;
		timeline.addClass('is-collapsed');
		stagger();
		toggle.prop('hidden', false).on('click', function(){
			var expanded = timeline.toggleClass('is-collapsed').hasClass('is-collapsed') === false;
			toggle.attr('aria-expanded', expanded)
				.contents().first()[0].textContent = expanded ? 'Hide earlier roles ' : 'Show earlier roles (2018 – 2020) ';
			stagger();
		});
	}

/* --------------------------------------------------
	Open Source stats (live from Packagist)
-------------------------------------------------- */

	function initOpenSource () {
		$('.oss-card[data-package]').each(function(){
			var card = $(this);
			$.getJSON('https://packagist.org/packages/' + card.data('package') + '.json', function(data){
				var installs = data.package.downloads.total;
				// Only show install counts once they're meaningful.
				card.find('[data-stat="downloads"]').text(installs.toLocaleString('en-US')).parent().toggle(installs >= 100);
				card.find('[data-stat="stars"]').text(data.package.github_stars);
			});
		});
	}

/* --------------------------------------------------
	Resize
-------------------------------------------------- */

	function initResize () {
		var header = $(".header-text");
		$(window).scroll(function() {
			var scroll = $(window).scrollTop();
			$('#scroll-page-content').toggleClass('is-hidden', scroll > 50);
			if ($(".index-page").length > 0) {
				if (scroll >= 270) {
					header.addClass("remove");
				} else {
					header.removeClass("remove");
				}
			}else{
				if (scroll >= 120) {
					header.addClass("remove");
				} else {
					header.removeClass("remove");
				}
			}
		});

	}
	

/* --------------------------------------------------
	Typed js
-------------------------------------------------- */
document.addEventListener("DOMContentLoaded", function() {
	// Only the homepage hero has the typed headline.
	if (!document.getElementById("typed")) return;
	new Typed("#typed", {
	  strings: [
		"<b>a Tech Lead</b>",
		"<b>an Engineering Manager</b>",
		"<b>a Backend Architect</b>"
	  ],
	    typeSpeed: 50,
		backSpeed: 25,
		backDelay: 1200,
		startDelay: 300,
		loop: true,
		smartBackspace: true
	});
  });