
	
/* --------------------------------------------------
	Initialization
-------------------------------------------------- */

    // Initialize all functions when the document is ready.
	$(document).ready(function(){
		initResize();
		initScroller();
		initAnimation();
		initowlCarousel();
		initOpenSource();
		initNav();
		initDesignLightbox();
	});


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

		links.on('click', function(e){
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
		$('#scroll-page-content').localScroll({
           target:'#page-content'
        });
		$('#page-top').localScroll({
           target:'body'
        });
	}


/* --------------------------------------------------
	Animation
-------------------------------------------------- */

	function initAnimation () {
		new WOW().init();
	}


	
/* --------------------------------------------------
	Owl Carusel
-------------------------------------------------- */

	function initowlCarousel () {
		$("#owl-branding").owlCarousel({
			autoPlay: 3000,
			items : 5,
			itemsDesktop : [1199,4],
			itemsDesktopSmall : [979,3],
			itemsTablet : [768, 2],
			itemsMobile : [479, 2],
			navigation: false,
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
		
		$(window).resize(function(){
			var width = (window.innerWidth > 0) ? window.innerWidth : screen.width;
			var footerHeight = $('#footer').outerHeight();
			if (width >= '768') { 
				$('#page-content').css({'marginBottom': footerHeight + 'px'});
			}else{
				$('#page-content').css({'marginBottom': '0px'});
			}
		});
		$(window).resize();
	}
	

/* --------------------------------------------------
	Typed js
-------------------------------------------------- */
document.addEventListener("DOMContentLoaded", function() {
	new Typed("#typed", {
	  strings: [
		"<b>a Tech Lead</b>",
		"<b>an Engineering Manager</b>",
		"<b>a Backend Architect</b>",
		"<b>a Problem Solver</b>"
	  ],
	  typeSpeed: 100,
	  backSpeed: 0,
	  loop: true
	});
  });